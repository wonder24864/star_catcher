/**
 * ScheduleManager — runtime administration of BullMQ repeatable jobs.
 *
 * Admin UI / tRPC admin router call into this manager to:
 *   - list current schedules with resolved pattern + next run
 *   - update a cron pattern (validates, upserts SystemConfig, re-registers)
 *   - enable/disable a schedule (upsert SystemConfig, upsert/remove scheduler)
 *   - trigger a one-off run (debounced via Redis cooldown key)
 *
 * BullMQ's upsertJobScheduler is backed by Redis and therefore safe to call
 * from either API or Worker processes — both share the same queue by name.
 *
 * See: src/worker/schedule-registry.ts, src/server/routers/admin.ts
 */
import type { Queue } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { getQueue } from "@/lib/infra/queue";
import { redis } from "@/lib/infra/redis";
import {
  SCHEDULE_REGISTRY,
  resolveEntry,
  type ScheduleEntry,
  type ResolvedSchedule,
} from "@/worker/schedule-registry";
import {
  validateCronPattern,
  nextRunAt,
  type ScheduleEntryKey,
} from "@/lib/domain/config/schedule-config";

export interface ScheduleStatus {
  entryKey: ScheduleEntryKey;
  jobName: string;
  description: string;
  pattern: string;
  enabled: boolean;
  source: "db" | "env" | "default";
  defaultPattern: string;
  nextRunAt: string | null; // ISO 8601, UTC
}

const TRIGGER_COOLDOWN_SECONDS = 60;

function findEntry(entryKey: string): ScheduleEntry {
  const entry = SCHEDULE_REGISTRY.find((e) => e.key === entryKey);
  if (!entry) {
    throw new Error(`Unknown schedule entry: ${entryKey}`);
  }
  return entry;
}

export class ScheduleManager {
  constructor(
    private readonly db: PrismaClient,
    private readonly queue: Queue = getQueue(),
  ) {}

  async list(): Promise<ScheduleStatus[]> {
    const out: ScheduleStatus[] = [];
    for (const entry of SCHEDULE_REGISTRY) {
      const resolved = await resolveEntry(entry, this.db);
      out.push(this.toStatus(resolved));
    }
    return out;
  }

  async get(entryKey: string): Promise<ScheduleStatus> {
    const entry = findEntry(entryKey);
    const resolved = await resolveEntry(entry, this.db);
    return this.toStatus(resolved);
  }

  async updateCron(entryKey: string, pattern: string): Promise<ScheduleStatus> {
    const entry = findEntry(entryKey);
    const validation = validateCronPattern(pattern);
    if (!validation.ok) {
      throw new Error(
        `Invalid cron pattern "${pattern}": ${validation.error ?? "parse failed"}`,
      );
    }

    await this.db.systemConfig.upsert({
      where: { key: entry.configKeys.cron },
      create: { key: entry.configKeys.cron, value: pattern },
      update: { value: pattern },
    });

    const resolved = await resolveEntry(entry, this.db);
    if (resolved.enabled) {
      await this.queue.upsertJobScheduler(
        entry.key,
        { pattern: resolved.pattern, tz: "UTC" },
        { name: entry.jobName, data: entry.data },
      );
    }
    return this.toStatus(resolved);
  }

  async setEnabled(
    entryKey: string,
    enabled: boolean,
  ): Promise<ScheduleStatus> {
    const entry = findEntry(entryKey);
    await this.db.systemConfig.upsert({
      where: { key: entry.configKeys.enabled },
      create: { key: entry.configKeys.enabled, value: enabled },
      update: { value: enabled },
    });

    const resolved = await resolveEntry(entry, this.db);
    if (resolved.enabled) {
      await this.queue.upsertJobScheduler(
        entry.key,
        { pattern: resolved.pattern, tz: "UTC" },
        { name: entry.jobName, data: entry.data },
      );
    } else {
      await this.queue.removeJobScheduler(entry.key).catch(() => {});
    }
    return this.toStatus(resolved);
  }

  /**
   * Manually enqueue a one-off run of the job. Protected by a Redis cooldown
   * key to prevent accidental spam (e.g. double-clicks). Returns the new
   * BullMQ job id.
   */
  async triggerNow(entryKey: string): Promise<string> {
    const entry = findEntry(entryKey);
    const cooldownKey = `schedule:trigger:cooldown:${entry.key}`;
    const acquired = await redis.set(
      cooldownKey,
      "1",
      "EX",
      TRIGGER_COOLDOWN_SECONDS,
      "NX",
    );
    if (acquired !== "OK") {
      const ttl = await redis.ttl(cooldownKey);
      throw new Error(
        `Trigger cooldown active — please retry in ${Math.max(ttl, 1)}s`,
      );
    }

    const job = await this.queue.add(entry.jobName, entry.data, {
      attempts: 1,
      removeOnComplete: 100,
      removeOnFail: 200,
    });
    if (!job.id) {
      throw new Error("BullMQ returned job without id");
    }
    return job.id;
  }

  private toStatus(resolved: ResolvedSchedule): ScheduleStatus {
    const { entry, pattern, enabled, source } = resolved;
    const next = enabled ? nextRunAt(pattern) : null;
    return {
      entryKey: entry.key,
      jobName: entry.jobName,
      description: entry.description,
      pattern,
      enabled,
      source,
      defaultPattern: entry.defaults.cron,
      nextRunAt: next ? next.toISOString() : null,
    };
  }
}
