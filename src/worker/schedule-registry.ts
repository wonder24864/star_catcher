/**
 * Schedule Registry — declarative repeatable job definitions.
 *
 * Worker calls registerSchedules() at startup to upsert all cron jobs.
 * Each entry's cron pattern is resolved at registration time with priority:
 *   SystemConfig row → envFallback → defaults.cron
 * Enabled flag: SystemConfig row (if present) → defaults.enabled
 *
 * New scheduled jobs: add one entry here + add config keys in schedule-config.
 *
 * See: docs/sprints/sprint-10a.md (Task 93)
 * See: docs/adr/011-learning-closed-loop.md (D12)
 */

import type { Queue } from "bullmq";
import type { AIJobData, AIJobName } from "@/lib/infra/queue/types";
import { createLogger } from "@/lib/infra/logger";
import { db as defaultDb } from "@/lib/infra/db";
import {
  SCHEDULE_CONFIG_KEYS,
  validateCronPattern,
  type ScheduleEntryKey,
} from "@/lib/domain/config/schedule-config";

/** Duck-typed slice of Prisma client — accepts both the base PrismaClient
 *  and extended clients (ctx.db) without fighting Prisma's generic typing. */
interface SystemConfigDb {
  systemConfig: {
    findMany: (args: {
      where: { key: { in: string[] } };
      select: { key: true; value: true };
    }) => Promise<Array<{ key: string; value: unknown }>>;
  };
}

const log = createLogger("schedule-registry");

export interface ScheduleEntry {
  /** Unique key for this repeatable job (used by BullMQ to dedup) */
  key: ScheduleEntryKey;
  /** Job name (must exist in JOB_HANDLERS) */
  jobName: AIJobName;
  /** Default job data (scheduled jobs usually need minimal data) */
  data: AIJobData;
  /** Human-readable description for logging / admin UI */
  description: string;
  /** SystemConfig keys that, when present, override the compiled defaults */
  configKeys: {
    cron: string;
    enabled: string;
  };
  /** Fallback values used when no SystemConfig row exists */
  defaults: {
    cron: string;
    enabled: boolean;
  };
  /** Optional env var that takes precedence over defaults but not SystemConfig */
  envFallback?: string;
}

/**
 * All scheduled jobs declared here. Worker startup registers them.
 */
export const SCHEDULE_REGISTRY: ScheduleEntry[] = [
  {
    key: "learning-brain-daily",
    jobName: "learning-brain",
    data: { studentId: "__all__", userId: "system", locale: "zh" },
    description: "Daily Learning Brain run for all students",
    configKeys: SCHEDULE_CONFIG_KEYS.brain,
    defaults: { cron: "0 22 * * *", enabled: true }, // UTC 22:00 = Beijing 06:00
    envFallback: "BRAIN_CRON_PATTERN",
  },
  {
    key: "weakness-profile-weekly",
    jobName: "weakness-profile",
    data: { studentId: "__all__", userId: "system", locale: "zh" },
    description: "Weekly weakness profile generation",
    configKeys: SCHEDULE_CONFIG_KEYS.weaknessProfile,
    defaults: { cron: "0 3 * * 0", enabled: true },
  },
  {
    key: "learning-suggestion-weekly",
    jobName: "learning-suggestion",
    data: { studentId: "__all__", userId: "system", locale: "zh" },
    description: "Weekly learning suggestion generation",
    configKeys: SCHEDULE_CONFIG_KEYS.learningSuggestion,
    defaults: { cron: "0 4 * * 0", enabled: true },
  },
];

export interface ResolvedSchedule {
  entry: ScheduleEntry;
  pattern: string;
  enabled: boolean;
  source: "db" | "env" | "default";
}

/**
 * Resolve a single entry against the current SystemConfig table + env vars.
 * Invalid DB patterns fall through to env/default (never crash the worker).
 * Accepts an optional db client so callers with ctx.db (tRPC) can use the
 * request-scoped Prisma instance (and so tests can inject mocks).
 */
export async function resolveEntry(
  entry: ScheduleEntry,
  db: SystemConfigDb = defaultDb,
): Promise<ResolvedSchedule> {
  const rows = await db.systemConfig.findMany({
    where: { key: { in: [entry.configKeys.cron, entry.configKeys.enabled] } },
    select: { key: true, value: true },
  });
  const values = new Map(rows.map((r) => [r.key, r.value]));

  const dbCron = values.get(entry.configKeys.cron);
  const dbEnabled = values.get(entry.configKeys.enabled);

  let pattern: string = entry.defaults.cron;
  let source: "db" | "env" | "default" = "default";

  if (typeof dbCron === "string" && validateCronPattern(dbCron).ok) {
    pattern = dbCron;
    source = "db";
  } else {
    if (typeof dbCron === "string") {
      log.warn(
        { key: entry.configKeys.cron, value: dbCron },
        "SystemConfig cron value is invalid — falling back",
      );
    }
    const envValue = entry.envFallback
      ? process.env[entry.envFallback]
      : undefined;
    if (envValue && validateCronPattern(envValue).ok) {
      pattern = envValue;
      source = "env";
    }
  }

  const enabled =
    typeof dbEnabled === "boolean" ? dbEnabled : entry.defaults.enabled;

  return { entry, pattern, enabled, source };
}

/**
 * Register all scheduled jobs via queue.upsertJobScheduler().
 * Idempotent: safe to call on every worker restart.
 */
export async function registerSchedules(
  queue: Queue<AIJobData, void, AIJobName>,
): Promise<void> {
  for (const entry of SCHEDULE_REGISTRY) {
    try {
      const resolved = await resolveEntry(entry);
      if (!resolved.enabled) {
        await (queue as Queue).removeJobScheduler(entry.key).catch(() => {});
        log.info(
          { key: entry.key },
          `Schedule disabled via SystemConfig: ${entry.description}`,
        );
        continue;
      }

      await (queue as Queue).upsertJobScheduler(
        entry.key,
        { pattern: resolved.pattern, tz: "UTC" },
        {
          name: entry.jobName,
          data: entry.data,
        },
      );
      log.info(
        {
          key: entry.key,
          pattern: resolved.pattern,
          source: resolved.source,
          jobName: entry.jobName,
        },
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
