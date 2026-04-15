/**
 * Embedding Generate job handler (Sprint 13).
 *
 * Flow: Load ErrorQuestion → embed content → write back to embedding column.
 *
 * Non-Agent handler — direct embedding call, no AgentRunner / Skill IPC needed.
 * Pattern reference: src/worker/handlers/help-generate.ts
 *
 * Idempotent: re-running for the same id simply re-computes the same vector.
 * If the row was soft-deleted between enqueue and run, log + return (no retry).
 *
 * See: docs/sprints/sprint-13.md (Task 116)
 */

import type { Job } from "bullmq";
import type { EmbeddingGenerateJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { AzureEmbeddingProvider } from "@/lib/domain/ai/embedding/azure";
import { createLogger } from "@/lib/infra/logger";

/** text-embedding-3-small handles ~8k tokens; ~6000 chars is a safe budget. */
const MAX_EMBEDDING_INPUT_CHARS = 6000;

let providerSingleton: AzureEmbeddingProvider | null = null;
function getProvider(): AzureEmbeddingProvider {
  if (!providerSingleton) {
    providerSingleton = new AzureEmbeddingProvider();
  }
  return providerSingleton;
}

export async function handleEmbeddingGenerate(
  job: Job<EmbeddingGenerateJobData>,
): Promise<void> {
  const { errorQuestionId, correlationId } = job.data;
  const log = createLogger("worker:embedding-generate").child({
    jobId: job.id,
    correlationId: correlationId ?? `eg-${errorQuestionId}-${job.id}`,
    errorQuestionId,
  });

  const errorQuestion = await db.errorQuestion.findUnique({
    where: { id: errorQuestionId },
    select: { id: true, content: true, deletedAt: true },
  });

  if (!errorQuestion) {
    log.warn("ErrorQuestion not found, skipping embedding generation");
    return;
  }
  if (errorQuestion.deletedAt) {
    log.info("ErrorQuestion soft-deleted, skipping embedding generation");
    return;
  }

  const trimmed = errorQuestion.content.trim();
  if (!trimmed) {
    log.warn("ErrorQuestion has empty content, skipping embedding generation");
    return;
  }

  const input =
    trimmed.length > MAX_EMBEDDING_INPUT_CHARS
      ? trimmed.slice(0, MAX_EMBEDDING_INPUT_CHARS)
      : trimmed;

  const startedAt = Date.now();
  const vector = await getProvider().embed(input);
  const durationMs = Date.now() - startedAt;

  // Format as pgvector literal: [v1,v2,...]
  const vectorLiteral = `[${vector.join(",")}]`;

  // Use $executeRaw with parameter binding; cast to vector inside the SQL.
  await db.$executeRaw`
    UPDATE "ErrorQuestion"
    SET embedding = ${vectorLiteral}::vector
    WHERE id = ${errorQuestionId}
  `;

  log.info(
    {
      durationMs,
      inputChars: input.length,
      truncated: trimmed.length > MAX_EMBEDDING_INPUT_CHARS,
    },
    "Embedding generated and persisted",
  );
}
