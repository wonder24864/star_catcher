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
  KGImportJobData,
  LearningBrainJobData,
  WeaknessProfileJobData,
  InterventionPlanningJobData,
  MasteryEvaluationJobData,
  EmbeddingGenerateJobData,
  EvalRunJobData,
  LearningSuggestionJobData,
  GenerateExplanationJobData,
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

/**
 * Enqueue knowledge graph import job.
 * Timeout: 30s, Retries: 2 (PDF parse + single AI call)
 */
export async function enqueueKGImport(
  data: KGImportJobData,
): Promise<string> {
  const job = await getQueue().add("kg-import", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

// ---------------------------------------------------------------------------
// Phase 3 enqueue functions
// ---------------------------------------------------------------------------

/**
 * Enqueue Learning Brain job (single student or __all__ fanout).
 * Timeout: 5min, Retries: 2
 */
export async function enqueueLearningBrain(
  data: LearningBrainJobData,
): Promise<string> {
  const job = await getQueue().add("learning-brain", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue weakness profile analysis job.
 * Timeout: 2min, Retries: 2
 */
export async function enqueueWeaknessProfile(
  data: WeaknessProfileJobData,
): Promise<string> {
  const job = await getQueue().add("weakness-profile", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue intervention planning agent job.
 * Timeout: 60s, Retries: 3 (Agent may need multiple AI calls)
 */
export async function enqueueInterventionPlanning(
  data: InterventionPlanningJobData,
): Promise<string> {
  const job = await getQueue().add("intervention-planning", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue mastery evaluation agent job.
 * Timeout: 60s, Retries: 2
 */
export async function enqueueMasteryEvaluation(
  data: MasteryEvaluationJobData,
): Promise<string> {
  const job = await getQueue().add("mastery-evaluation", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue ErrorQuestion embedding generation job.
 * Timeout: 30s (single embed call), Retries: 2 (Sprint 13).
 */
export async function enqueueEmbeddingGenerate(
  data: EmbeddingGenerateJobData,
): Promise<string> {
  const job = await getQueue().add("embedding-generate", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue EvalFramework run — Sprint 16 US-058.
 *
 * Long-running (~3-6 min for Run All): single attempt, no retry (admin can
 * re-trigger manually if the run fails). EvalRun row must already exist
 * with status=RUNNING; handler finalizes it.
 */
export async function enqueueEvalRun(
  data: EvalRunJobData,
): Promise<string> {
  const job = await getQueue().add("eval-run", data, {
    attempts: 1,
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  return job.id!;
}

/**
 * Enqueue learning suggestion generation job — Sprint 18 US-061.
 * Timeout: 60s (single AI call), Retries: 2.
 */
export async function enqueueLearningSuggestion(
  data: LearningSuggestionJobData,
): Promise<string> {
  const job = await getQueue().add("learning-suggestion", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}

/**
 * Enqueue generate-explanation job — parent clicks "看讲解" on an error
 * question. Timeout: 60s (single AI call), Retries: 2. Result is cached
 * to ErrorQuestion.explanation so subsequent opens skip the AI call.
 */
export async function enqueueGenerateExplanation(
  data: GenerateExplanationJobData,
): Promise<string> {
  const job = await getQueue().add("generate-explanation", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return job.id!;
}
