/**
 * BullMQ Worker entry point.
 *
 * Runs as a separate process (star-catcher-worker in Docker).
 * Listens on the "ai-jobs" queue and routes jobs to handlers.
 *
 * See docs/adr/003-bullmq-async-ai.md
 */

import { Worker, type Job } from "bullmq";
import { createBullMQConnection } from "@/lib/infra/queue/connection";
import type { AIJobData, AIJobName } from "@/lib/infra/queue/types";
import { handleOcrRecognize } from "./handlers/ocr-recognize";
import { handleCorrectionPhotos } from "./handlers/correction-photos";
import { handleHelpGenerate } from "./handlers/help-generate";
import { handleKGImport } from "./handlers/kg-import";
import { handleQuestionUnderstanding } from "./handlers/question-understanding";

console.log("[worker] Starting AI jobs worker...");

const worker = new Worker<AIJobData, void, AIJobName>(
  "ai-jobs",
  async (job: Job<AIJobData, void, AIJobName>) => {
    console.log(
      `[worker] Processing job ${job.id} (${job.name}), attempt ${job.attemptsMade + 1}`,
    );

    switch (job.name) {
      case "ocr-recognize":
        await handleOcrRecognize(job as Job<AIJobData & { sessionId: string }>);
        break;
      case "correction-photos":
        await handleCorrectionPhotos(
          job as Job<AIJobData & { sessionId: string; imageIds: string[] }>,
        );
        break;
      case "help-generate":
        await handleHelpGenerate(
          job as Job<
            AIJobData & {
              sessionId: string;
              questionId: string;
              level: 1 | 2 | 3;
            }
          >,
        );
        break;
      case "kg-import":
        await handleKGImport(job as unknown as Job<import("@/lib/infra/queue/types").KGImportJobData>);
        break;
      case "question-understanding":
        await handleQuestionUnderstanding(
          job as unknown as Job<import("@/lib/infra/queue/types").QuestionUnderstandingJobData>,
        );
        break;
      default:
        console.warn(`[worker] Unknown job name: ${job.name}`);
    }
  },
  {
    connection: createBullMQConnection(),
    concurrency: 3,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
);

worker.on("completed", (job) => {
  console.log(`[worker] Job ${job.id} (${job.name}) completed`);
});

worker.on("failed", (job, error) => {
  console.error(
    `[worker] Job ${job?.id} (${job?.name}) failed: ${error.message}`,
  );
});

worker.on("error", (error) => {
  console.error("[worker] Worker error:", error);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`[worker] Received ${signal}, shutting down...`);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log("[worker] AI jobs worker started, waiting for jobs...");
