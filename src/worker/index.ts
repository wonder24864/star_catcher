/**
 * BullMQ Worker entry point.
 *
 * Runs as a separate process (star-catcher-worker in Docker).
 * Listens on the "ai-jobs" queue and routes jobs via Handler Registry.
 *
 * See docs/adr/003-bullmq-async-ai.md
 * See docs/sprints/sprint-10a.md (Task 93 — Handler Registry + Schedule Registry)
 */

// Mark as worker before logger initializes (affects base.service field)
process.env.WORKER_MODE = "true";

// OTel initialization (must be early, before other imports)
import { initTelemetry } from "@/lib/infra/telemetry";
initTelemetry("star-catcher-worker");

import { Worker, Queue, type Job } from "bullmq";
import { createBullMQConnection } from "@/lib/infra/queue/connection";
import type { AIJobData, AIJobName } from "@/lib/infra/queue/types";
import { createLogger } from "@/lib/infra/logger";
import { routeJob } from "./handler-registry";
import { registerSchedules } from "./schedule-registry";

const log = createLogger("worker");

log.info("Starting AI jobs worker...");

const connection = createBullMQConnection();

// ── Worker ──

const worker = new Worker<AIJobData, void, AIJobName>(
  "ai-jobs",
  async (job: Job<AIJobData, void, AIJobName>) => {
    const jobLog = log.child({ jobId: job.id, jobName: job.name, attempt: job.attemptsMade + 1 });
    jobLog.info("Processing job");
    await routeJob(job);
  },
  {
    connection,
    concurrency: 3,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 200 },
  },
);

worker.on("completed", (job) => {
  log.info({ jobId: job.id, jobName: job.name }, "Job completed");
});

worker.on("failed", (job, error) => {
  log.error({ jobId: job?.id, jobName: job?.name, err: error }, "Job failed");
});

worker.on("error", (error) => {
  log.error({ err: error }, "Worker error");
});

// ── Schedule Registry ──

const queue = new Queue<AIJobData, void, AIJobName>("ai-jobs", { connection });
registerSchedules(queue).catch((e) => {
  log.error({ err: e }, "Failed to register schedules");
});

// ── Graceful shutdown ──

async function shutdown(signal: string) {
  log.info({ signal }, "Received signal, shutting down...");
  await worker.close();
  await queue.close();
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

log.info("AI jobs worker started, waiting for jobs...");
