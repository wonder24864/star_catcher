/**
 * Similar Questions — dual-path retrieval.
 *
 * Path 1 (KP): other ErrorQuestions mapped to the same knowledge point.
 * Path 2 (EMBEDDING): pgvector cosine similarity on ErrorQuestion.embedding.
 *
 * Merge policy: KP results first (preserve order), then embedding results
 * that aren't already included. Truncate to `limit` (default 5).
 *
 * Shared implementation for:
 *   - `find-similar-questions` Skill (called via ctx.query("findSimilarQuestions", ...))
 *   - `dailyTask.startTask` tRPC router (called directly)
 *
 * See: docs/user-stories/similar-questions-explanation.md (US-051)
 *      docs/PHASE3-LAUNCH-PLAN.md §四 D15
 */

import type { PrismaClient } from "@prisma/client";

export interface SimilarQuestion {
  id: string;
  content: string;
  correctAnswer: string | null;
  source: "KP" | "EMBEDDING";
  similarity?: number;
}

export interface FindSimilarQuestionsParams {
  /**
   * Target error question — used both as the pgvector query seed and as an
   * ID to exclude from results. Optional: when the caller has no source
   * question (e.g. Intervention Agent generated a PRACTICE task without
   * questionId per its prompt), the function degrades to KP-only retrieval.
   */
  errorQuestionId?: string | null;
  knowledgePointId: string;
  limit?: number;
}

const DEFAULT_LIMIT = 5;

export async function findSimilarQuestions(
  db: PrismaClient,
  params: FindSimilarQuestionsParams,
): Promise<SimilarQuestion[]> {
  const limit = params.limit ?? DEFAULT_LIMIT;
  if (limit <= 0) return [];

  // ── Path 1: KP dimension ───────────────────────────────
  const kpRows = await db.errorQuestion.findMany({
    where: {
      ...(params.errorQuestionId
        ? { id: { not: params.errorQuestionId } }
        : {}),
      deletedAt: null,
      knowledgeMappings: {
        some: { knowledgePointId: params.knowledgePointId },
      },
    },
    select: { id: true, content: true, correctAnswer: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  const merged = new Map<string, SimilarQuestion>();
  for (const r of kpRows) {
    merged.set(r.id, {
      id: r.id,
      content: r.content,
      correctAnswer: r.correctAnswer,
      source: "KP",
    });
  }

  if (merged.size >= limit) {
    return Array.from(merged.values()).slice(0, limit);
  }

  // ── Path 2: embedding cosine ───────────────────────────
  // Requires a seed target: if the caller didn't supply errorQuestionId, or
  // the target has no embedding yet (async generation pending), skip this
  // path silently and return the KP-only results.
  if (!params.errorQuestionId) {
    return Array.from(merged.values()).slice(0, limit);
  }

  const targetRows = await db.$queryRaw<Array<{ embedding_text: string | null }>>`
    SELECT embedding::text AS embedding_text
    FROM "ErrorQuestion"
    WHERE id = ${params.errorQuestionId}
      AND "deletedAt" IS NULL
    LIMIT 1
  `;

  const targetEmbeddingText = targetRows[0]?.embedding_text;
  if (!targetEmbeddingText) {
    return Array.from(merged.values()).slice(0, limit);
  }

  const remaining = limit - merged.size;
  // Fetch more than `remaining` so we can skip duplicates, but bounded.
  const vectorLimit = remaining + merged.size + 5;
  const targetId = params.errorQuestionId;

  const embeddingRows = await db.$queryRaw<
    Array<{
      id: string;
      content: string;
      correctAnswer: string | null;
      similarity: number;
    }>
  >`
    SELECT id,
           content,
           "correctAnswer",
           1 - (embedding <=> ${targetEmbeddingText}::vector) AS similarity
    FROM "ErrorQuestion"
    WHERE id <> ${targetId}
      AND embedding IS NOT NULL
      AND "deletedAt" IS NULL
    ORDER BY embedding <=> ${targetEmbeddingText}::vector
    LIMIT ${vectorLimit}
  `;

  for (const row of embeddingRows) {
    if (merged.size >= limit) break;
    if (merged.has(row.id)) continue;
    merged.set(row.id, {
      id: row.id,
      content: row.content,
      correctAnswer: row.correctAnswer,
      source: "EMBEDDING",
      similarity: Number(row.similarity),
    });
  }

  return Array.from(merged.values()).slice(0, limit);
}
