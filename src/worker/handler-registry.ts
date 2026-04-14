/**
 * Handler Registry — maps AIJobName → handler function.
 *
 * Replaces the switch statement in worker/index.ts (Rule 9).
 * New handlers: add one entry here, no routing code to change.
 *
 * See: docs/sprints/sprint-10a.md (Task 93)
 */

import type { Job } from "bullmq";
import type {
  AIJobData,
  AIJobName,
  OcrRecognizeJobData,
  CorrectionPhotosJobData,
  HelpGenerateJobData,
  KGImportJobData,
  QuestionUnderstandingJobData,
  DiagnosisJobData,
  LearningBrainJobData,
  WeaknessProfileJobData,
} from "@/lib/infra/queue/types";
import { handleOcrRecognize } from "./handlers/ocr-recognize";
import { handleCorrectionPhotos } from "./handlers/correction-photos";
import { handleHelpGenerate } from "./handlers/help-generate";
import { handleKGImport } from "./handlers/kg-import";
import { handleQuestionUnderstanding } from "./handlers/question-understanding";
import { handleDiagnosis } from "./handlers/diagnosis";
import { handleLearningBrain } from "./handlers/learning-brain";
import { handleWeaknessProfile } from "./handlers/weakness-profile";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("worker");

export type JobHandler = (job: Job<AIJobData, void, AIJobName>) => Promise<void>;

/**
 * Registry of all job handlers. Each AIJobName maps to exactly one handler.
 *
 * Type assertion is needed because each handler expects a narrower Job type
 * than the union. The handler itself validates its payload.
 */
export const JOB_HANDLERS: Record<AIJobName, JobHandler> = {
  "ocr-recognize": (job) =>
    handleOcrRecognize(job as Job<OcrRecognizeJobData>),

  "correction-photos": (job) =>
    handleCorrectionPhotos(job as Job<CorrectionPhotosJobData>),

  "help-generate": (job) =>
    handleHelpGenerate(job as Job<HelpGenerateJobData>),

  "kg-import": (job) =>
    handleKGImport(job as Job<KGImportJobData>),

  "question-understanding": (job) =>
    handleQuestionUnderstanding(job as Job<QuestionUnderstandingJobData>),

  "diagnosis": (job) =>
    handleDiagnosis(job as Job<DiagnosisJobData>),

  "learning-brain": (job) =>
    handleLearningBrain(job as Job<LearningBrainJobData>),

  "weakness-profile": (job) =>
    handleWeaknessProfile(job as Job<WeaknessProfileJobData>),

  "intervention-planning": async (job) => {
    log.info({ jobId: job.id }, "intervention-planning stub: not yet implemented");
  },

  "mastery-evaluation": async (job) => {
    log.info({ jobId: job.id }, "mastery-evaluation stub: not yet implemented");
  },
};

/**
 * Route a job to its handler. Throws if job name is unknown.
 */
export async function routeJob(job: Job<AIJobData, void, AIJobName>): Promise<void> {
  const handler = JOB_HANDLERS[job.name];
  if (!handler) {
    throw new Error(`Unknown job name: ${job.name}`);
  }
  await handler(job);
}
