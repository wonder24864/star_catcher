/**
 * Schedule configuration keys — SystemConfig rows that override the
 * compiled-in defaults in SCHEDULE_REGISTRY. Kept in a single place so both
 * the worker (startup registration) and the admin router (runtime edits)
 * reference the same strings.
 *
 * Resolution order at runtime: SystemConfig row → env var → code default.
 *
 * See: src/worker/schedule-registry.ts, src/lib/infra/schedule/schedule-manager.ts
 */
import { CronExpressionParser } from "cron-parser";

export const SCHEDULE_CONFIG_KEYS = {
  brain: {
    cron: "schedule.brain.cron",
    enabled: "schedule.brain.enabled",
  },
  weaknessProfile: {
    cron: "schedule.weaknessProfile.cron",
    enabled: "schedule.weaknessProfile.enabled",
  },
  learningSuggestion: {
    cron: "schedule.learningSuggestion.cron",
    enabled: "schedule.learningSuggestion.enabled",
  },
} as const;

export type ScheduleEntryKey =
  | "learning-brain-daily"
  | "weakness-profile-weekly"
  | "learning-suggestion-weekly";

/**
 * Validate a cron pattern using cron-parser. Returns { ok: true } or
 * { ok: false, error }. Used by both SystemConfig writes (admin router) and
 * worker startup (ignore invalid DB values, fall through to default).
 */
export function validateCronPattern(pattern: string): {
  ok: boolean;
  error?: string;
} {
  try {
    CronExpressionParser.parse(pattern, { tz: "UTC" });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "invalid cron expression",
    };
  }
}

/**
 * Compute the next execution time (UTC) for a cron pattern.
 * Returns null if the pattern is invalid.
 */
export function nextRunAt(pattern: string): Date | null {
  try {
    const interval = CronExpressionParser.parse(pattern, { tz: "UTC" });
    return interval.next().toDate();
  } catch {
    return null;
  }
}
