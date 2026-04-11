/**
 * Knowledge Graph Import job handler.
 *
 * Flow: MinIO PDF → pdf-parse → extract TOC → AI extract knowledge points → DB insert
 * On completion: publishes event via Redis for SSE push.
 */

import type { Job } from "bullmq";
import type { Subject, SchoolLevel, Grade } from "@prisma/client";
import type { KGImportJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { getObjectBuffer } from "@/lib/infra/storage";
import { extractKnowledgePoints } from "@/lib/domain/ai/operations/extract-knowledge-points";
import { publishJobResult, sessionChannel } from "@/lib/infra/events";

/**
 * Extract table-of-contents text from PDF buffer.
 * Strategy: take first 5 pages which typically contain the TOC.
 */
async function extractTocFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse is CJS; dynamic import returns { default: fn } in ESM context
  const { default: pdfParse } = await import("pdf-parse") as unknown as { default: (buf: Buffer, opts?: { max?: number }) => Promise<{ text: string }> };
  const data = await pdfParse(buffer, { max: 5 }); // first 5 pages only
  return data.text;
}

export async function handleKGImport(
  job: Job<KGImportJobData>,
): Promise<void> {
  const { fileUrl, bookTitle, subject, grade, schoolLevel, userId, locale } = job.data;
  const channel = sessionChannel(`kg-import-${userId}`);

  try {
    // 1. Download PDF from MinIO
    const pdfBuffer = await getObjectBuffer(fileUrl);

    // 2. Extract TOC text from first pages
    const tocText = await extractTocFromPdf(pdfBuffer);

    if (!tocText || tocText.trim().length < 20) {
      await publishJobResult(channel, {
        type: "kg-import",
        status: "failed",
        error: "Could not extract table of contents from PDF",
      });
      return;
    }

    // 3. Call AI to extract knowledge points from TOC
    const result = await extractKnowledgePoints({
      tocText,
      bookTitle,
      subject,
      grade,
      schoolLevel,
      locale,
      context: {
        userId,
        locale,
        grade,
        correlationId: `kg-import-${job.id}`,
      },
    });

    if (!result.success) {
      if (result.error?.retryable) {
        throw new Error(result.error.message); // BullMQ will retry
      }
      await publishJobResult(channel, {
        type: "kg-import",
        status: "failed",
        error: result.error?.message ?? "AI extraction failed",
      });
      return;
    }

    const { knowledgePoints: extractedPoints } = result.data!;

    // 4. Build knowledge point tree and insert into DB
    let totalNew = 0;
    let totalDuplicate = 0;
    const nameToId = new Map<string, string>();

    for (const entry of extractedPoints) {
      // Check for duplicates (name + subject + schoolLevel)
      // Note: soft-delete filter (deletedAt: null) is applied automatically by Prisma extension
      const existing = await db.knowledgePoint.findFirst({
        where: { name: entry.name, subject: subject as Subject, schoolLevel: schoolLevel as SchoolLevel },
        select: { id: true },
      });

      if (existing) {
        totalDuplicate++;
        nameToId.set(entry.name, existing.id);
        continue;
      }

      // Resolve parentId from parentName
      let parentId: string | null = null;
      if (entry.parentName) {
        parentId = nameToId.get(entry.parentName) ?? null;
      }

      const created = await db.knowledgePoint.create({
        data: {
          name: entry.name,
          subject: subject as Subject,
          grade: grade as Grade | undefined,
          schoolLevel: schoolLevel as SchoolLevel,
          parentId,
          depth: entry.depth,
          difficulty: entry.difficulty ?? 3,
          importance: 3,
          examFrequency: 3,
          metadata: { importStatus: "pending_review", bookTitle, importedAt: new Date().toISOString() },
        },
      });

      nameToId.set(entry.name, created.id);
      totalNew++;
    }

    // 5. Create PREREQUISITE relations based on order (same-level sequential)
    const sortedByDepthAndOrder = extractedPoints
      .filter((p) => nameToId.has(p.name))
      .sort((a, b) => a.depth - b.depth || a.order - b.order);

    // Group by parentName to find siblings
    const siblingGroups = new Map<string, typeof sortedByDepthAndOrder>();
    for (const entry of sortedByDepthAndOrder) {
      const key = entry.parentName ?? "__root__";
      if (!siblingGroups.has(key)) siblingGroups.set(key, []);
      siblingGroups.get(key)!.push(entry);
    }

    for (const siblings of siblingGroups.values()) {
      for (let i = 1; i < siblings.length; i++) {
        const fromId = nameToId.get(siblings[i - 1].name);
        const toId = nameToId.get(siblings[i].name);
        if (fromId && toId) {
          // Create prerequisite: previous sibling is prerequisite of next
          await db.knowledgeRelation.create({
            data: {
              fromPointId: fromId,
              toPointId: toId,
              type: "PREREQUISITE",
              strength: 0.8,
            },
          });
        }
      }
    }

    // 6. Create explicit prerequisites from AI output
    for (const entry of extractedPoints) {
      if (entry.prerequisites && entry.prerequisites.length > 0) {
        const toId = nameToId.get(entry.name);
        if (!toId) continue;
        for (const prereqName of entry.prerequisites) {
          const fromId = nameToId.get(prereqName);
          if (fromId && fromId !== toId) {
            // Check not already created
            const exists = await db.knowledgeRelation.findFirst({
              where: { fromPointId: fromId, toPointId: toId, type: "PREREQUISITE" },
            });
            if (!exists) {
              await db.knowledgeRelation.create({
                data: {
                  fromPointId: fromId,
                  toPointId: toId,
                  type: "PREREQUISITE",
                  strength: 0.9,
                },
              });
            }
          }
        }
      }
    }

    // 7. Publish completion
    await publishJobResult(channel, {
      type: "kg-import",
      status: "completed",
      data: { totalExtracted: extractedPoints.length, totalNew, totalDuplicate },
    });

    console.log(
      `[kg-import] Completed: ${totalNew} new, ${totalDuplicate} duplicates from "${bookTitle}"`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[kg-import] Failed: ${message}`);

    try {
      await publishJobResult(channel, {
        type: "kg-import",
        status: "failed",
        error: message,
      });
    } catch (publishErr) {
      console.error("[kg-import] Failed to publish error event:", publishErr);
    }

    throw error; // Re-throw for BullMQ retry
  }
}
