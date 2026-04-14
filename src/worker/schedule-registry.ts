/**
 * Schedule Registry — declarative repeatable job definitions.
 *
 * Worker calls registerSchedules() at startup to upsert all cron jobs.
 * New scheduled jobs: add one entry here (Rule 9).
 *
 * See: docs/sprints/sprint-10a.md (Task 93)
 * See: docs/adr/011-learning-closed-loop.md (D12)
 */

import type { Queue } from "bullmq";
import type { AIJobData, AIJobName } from "@/lib/infra/queue/types";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("schedule-registry");

interface ScheduleEntry {
  /** Unique key for this repeatable job (used by BullMQ to dedup) */
  key: string;
  /** Cron expression (UTC) */
  pattern: string;
  /** Job name (must exist in JOB_HANDLERS) */
  jobName: AIJobName;
  /** Default job data (scheduled jobs usually need minimal data) */
  data: AIJobData;
  /** Human-readable description for logging */
  description: string;
}

/**
 * All scheduled jobs declared here. Worker startup registers them.
 */
export const SCHEDULE_REGISTRY: ScheduleEntry[] = [
  {
    key: "learning-brain-daily",
    pattern: process.env.BRAIN_CRON_PATTERN ?? "0 22 * * *", // Default UTC 22:00 = Beijing 06:00 (D12)
    jobName: "learning-brain",
    data: { studentId: "__all__", userId: "system", locale: "zh" },
    description: "Daily Learning Brain run for all students",
  },
  {
    key: "weakness-profile-weekly",
    pattern: "0 3 * * 0", // Weekly Sunday 03:00 UTC
    jobName: "weakness-profile",
    data: { studentId: "__all__", userId: "system", locale: "zh" },
    description: "Weekly weakness profile generation",
  },
];

/**
 * Register all scheduled jobs via queue.upsertJobScheduler().
 * Idempotent: safe to call on every worker restart.
 */
export async function registerSchedules(
  queue: Queue<AIJobData, void, AIJobName>,
): Promise<void> {
  for (const entry of SCHEDULE_REGISTRY) {
    try {
      await (queue as Queue).upsertJobScheduler(
        entry.key,
        { pattern: entry.pattern },
        {
          name: entry.jobName,
          data: entry.data,
        },
      );
      log.info(
        { key: entry.key, pattern: entry.pattern, jobName: entry.jobName },
        `Registered schedule: ${entry.description}`,
      );
    } catch (e) {
      log.error(
        { err: e, key: entry.key },
        `Failed to register schedule: ${entry.description}`,
      );
    }
  }
}
