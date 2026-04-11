/**
 * Question Understanding Agent job handler.
 *
 * Flow: CheckSession COMPLETED → Agent analyzes question → maps to knowledge points
 * Implemented in Sprint 5 Task 56.
 */

import type { Job } from "bullmq";
import type { QuestionUnderstandingJobData } from "@/lib/infra/queue/types";

export async function handleQuestionUnderstanding(
  job: Job<QuestionUnderstandingJobData>,
): Promise<void> {
  // TODO: Task 56 implementation
  console.log(`[question-understanding] Job ${job.id} — placeholder, implementing in Task 56`);
}
