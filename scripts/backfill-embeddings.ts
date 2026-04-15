/**
 * One-shot backfill: enqueue embedding-generate for ErrorQuestions
 * that are missing an embedding (Sprint 13 migration).
 *
 * Usage:
 *   npx tsx scripts/backfill-embeddings.ts          # all missing
 *   npx tsx scripts/backfill-embeddings.ts --limit 100
 *
 * Safe to re-run: handler is idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { enqueueEmbeddingGenerate } from "@/lib/infra/queue";

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg !== -1 && process.argv[limitArg + 1]
      ? parseInt(process.argv[limitArg + 1], 10)
      : undefined;

  const prisma = new PrismaClient();

  // Use raw SQL because Prisma can't filter on an Unsupported(vector) column.
  const rows = await prisma.$queryRaw<Array<{ id: string; studentId: string }>>`
    SELECT id, "studentId"
    FROM "ErrorQuestion"
    WHERE embedding IS NULL
      AND "deletedAt" IS NULL
      AND content IS NOT NULL
      AND length(content) > 0
    ORDER BY "createdAt" DESC
    ${limit ? `LIMIT ${limit}` : ""}
  `;

  console.log(`Backfill: enqueueing ${rows.length} embedding-generate jobs...`);

  let enqueued = 0;
  for (const row of rows) {
    try {
      await enqueueEmbeddingGenerate({
        errorQuestionId: row.id,
        userId: row.studentId,
        correlationId: `eg-backfill-${row.id}`,
      });
      enqueued++;
    } catch (err) {
      console.warn(`  Failed to enqueue ${row.id}: ${err}`);
    }
  }

  console.log(`Backfill: ${enqueued}/${rows.length} jobs enqueued.`);
  await prisma.$disconnect();
  // Allow BullMQ connection to drain before exit
  setTimeout(() => process.exit(0), 1000);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
