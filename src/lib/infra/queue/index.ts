/**
 * BullMQ queue instance and enqueue functions.
 *
 * Single queue "ai-jobs" with named jobs. Timeout/retry per ADR-003.
 * See docs/adr/003-bullmq-async-ai.md
 */

import { Queue } from "bullmq";
import { createBullMQConnection } from "./connection";
import type {
  OcrRecognizeJobData,
  CorrectionPhotosJobData,
  HelpGenerateJobData,
  QuestionUnderstandingJobData,
  DiagnosisJobData,
} from "./types";

// ---------------------------------------------------------------------------
// Queue singleton
// ---------------------------------------------------------------------------

let queue: Queue | null = null;

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue("ai-jobs", { connection: createBullMQConnection() });
  }
  return queue;
}

// ---------------------------------------------------------------------------
// Enqueue functions
// ---------------------------------------------------------------------------

/**
 * Enqueue OCR recognition job.
 * Timeout: 60s, Retries: 2 (ADR-003)
 */
export async function enqueueRecognition(
  data: OcrRecognizeJobData,
): Promise<string> {
  const job = await getQueue().add("ocr-recognize", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue correction photos job (recognize + re-grade compound).
 * Timeout: 60s, Retries: 2
 */
export async function enqueueCorrectionPhotos(
  data: CorrectionPhotosJobData,
): Promise<string> {
  const job = await getQueue().add("correction-photos", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue help generation job.
 * Timeout: 30s, Retries: 1 (ADR-003)
 */
export async function enqueueHelpGeneration(
  data: HelpGenerateJobData,
): Promise<string> {
  const job = await getQueue().add("help-generate", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue question understanding agent job.
 * Timeout: 30s, Retries: 2 (Agent may need multiple AI calls)
 */
export async function enqueueQuestionUnderstanding(
  data: QuestionUnderstandingJobData,
): Promise<string> {
  const job = await getQueue().add("question-understanding", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue diagnosis agent job.
 * Timeout: 30s, Retries: 2 (Agent may need multiple AI calls)
 */
export async function enqueueDiagnosis(
  data: DiagnosisJobData,
): Promise<string> {
  const job = await getQueue().add("diagnosis", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}
