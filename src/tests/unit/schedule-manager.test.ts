/**
 * Unit Tests: ScheduleManager + schedule-registry resolution.
 *
 * Verifies:
 *   - DB > env > default resolution priority
 *   - Invalid cron in DB falls through to env/default
 *   - updateCron validates + upserts SystemConfig + re-registers scheduler
 *   - setEnabled true upserts scheduler; false removes it
 *   - triggerNow enqueues a one-off job and enforces cooldown
 */
import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

// ── Mock Redis (cooldown key + fallback get/set) ──────────────────
const redisSetMock = vi.fn<(...args: unknown[]) => Promise<string | null>>(
  async () => "OK",
);
const redisGetMock = vi.fn(async () => null);
const redisDelMock = vi.fn(async () => 1);
const redisTtlMock = vi.fn(async () => 30);

vi.mock("@/lib/infra/redis", () => ({
  redis: {
    set: redisSetMock,
    get: redisGetMock,
    del: redisDelMock,
    ttl: redisTtlMock,
  },
}));

// ── Mock BullMQ Queue ─────────────────────────────────────────────
const queueAddMock = vi.fn(async () => ({ id: "job-1" }));
const queueUpsertMock = vi.fn(async () => undefined);
const queueRemoveMock = vi.fn(async () => undefined);

vi.mock("@/lib/infra/queue", () => ({
  getQueue: () => ({
    add: queueAddMock,
    upsertJobScheduler: queueUpsertMock,
    removeJobScheduler: queueRemoveMock,
  }),
}));

// ── Mock DB (SystemConfig) ────────────────────────────────────────
const systemConfigRows = new Map<string, unknown>();
const systemConfigFindMany = vi.fn(async (args: { where: { key: { in: string[] } } }) => {
  const keys = args.where.key.in;
  const rows = keys
    .filter((k) => systemConfigRows.has(k))
    .map((k) => ({ key: k, value: systemConfigRows.get(k) }));
  return rows;
});
const systemConfigUpsert = vi.fn(
  async (args: { where: { key: string }; create: { key: string; value: unknown }; update: { value: unknown } }) => {
    systemConfigRows.set(args.where.key, args.update.value);
    return { key: args.where.key, value: args.update.value };
  },
);

const mockDb = {
  systemConfig: {
    findMany: systemConfigFindMany,
    upsert: systemConfigUpsert,
  },
} as unknown as PrismaClient;

vi.mock("@/lib/infra/db", () => ({ db: mockDb }));

// ── System under test (imported AFTER mocks so require() resolves) ──
// Using dynamic import to ensure our mocks are in place.
let ScheduleManager: typeof import("@/lib/infra/schedule/schedule-manager").ScheduleManager;
let resolveEntry: typeof import("@/worker/schedule-registry").resolveEntry;
let SCHEDULE_REGISTRY: typeof import("@/worker/schedule-registry").SCHEDULE_REGISTRY;

beforeEach(async () => {
  vi.clearAllMocks();
  systemConfigRows.clear();
  delete process.env.BRAIN_CRON_PATTERN;
  redisSetMock.mockResolvedValue("OK");

  ({ ScheduleManager } = await import("@/lib/infra/schedule/schedule-manager"));
  ({ resolveEntry, SCHEDULE_REGISTRY } = await import("@/worker/schedule-registry"));
});

afterEach(() => {
  delete process.env.BRAIN_CRON_PATTERN;
});

describe("schedule-registry resolveEntry", () => {
  test("falls back to code default when DB and env are empty", async () => {
    const brain = SCHEDULE_REGISTRY.find((e) => e.key === "learning-brain-daily")!;
    const resolved = await resolveEntry(brain);
    expect(resolved.pattern).toBe(brain.defaults.cron);
    expect(resolved.source).toBe("default");
    expect(resolved.enabled).toBe(true);
  });

  test("uses env var when DB is empty and env is set", async () => {
    process.env.BRAIN_CRON_PATTERN = "0 6 * * *";
    const brain = SCHEDULE_REGISTRY.find((e) => e.key === "learning-brain-daily")!;
    const resolved = await resolveEntry(brain);
    expect(resolved.pattern).toBe("0 6 * * *");
    expect(resolved.source).toBe("env");
  });

  test("DB value takes priority over env and default", async () => {
    process.env.BRAIN_CRON_PATTERN = "0 6 * * *";
    systemConfigRows.set("schedule.brain.cron", "*/15 * * * *");
    const brain = SCHEDULE_REGISTRY.find((e) => e.key === "learning-brain-daily")!;
    const resolved = await resolveEntry(brain);
    expect(resolved.pattern).toBe("*/15 * * * *");
    expect(resolved.source).toBe("db");
  });

  test("invalid DB value falls through to env/default", async () => {
    process.env.BRAIN_CRON_PATTERN = "0 6 * * *";
    systemConfigRows.set("schedule.brain.cron", "not-a-cron");
    const brain = SCHEDULE_REGISTRY.find((e) => e.key === "learning-brain-daily")!;
    const resolved = await resolveEntry(brain);
    expect(resolved.pattern).toBe("0 6 * * *");
    expect(resolved.source).toBe("env");
  });

  test("enabled=false from DB is honored", async () => {
    systemConfigRows.set("schedule.brain.enabled", false);
    const brain = SCHEDULE_REGISTRY.find((e) => e.key === "learning-brain-daily")!;
    const resolved = await resolveEntry(brain);
    expect(resolved.enabled).toBe(false);
  });
});

describe("ScheduleManager.updateCron", () => {
  test("accepts valid cron, upserts SystemConfig, upserts scheduler", async () => {
    const mgr = new ScheduleManager(mockDb);
    const status = await mgr.updateCron("learning-brain-daily", "*/30 * * * *");
    expect(status.pattern).toBe("*/30 * * * *");
    expect(status.source).toBe("db");
    expect(systemConfigUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "schedule.brain.cron" },
      }),
    );
    expect(queueUpsertMock).toHaveBeenCalledWith(
      "learning-brain-daily",
      { pattern: "*/30 * * * *", tz: "UTC" },
      expect.any(Object),
    );
  });

  test("rejects invalid cron without writing SystemConfig", async () => {
    const mgr = new ScheduleManager(mockDb);
    await expect(
      mgr.updateCron("learning-brain-daily", "not-a-cron"),
    ).rejects.toThrow(/Invalid cron/);
    expect(systemConfigUpsert).not.toHaveBeenCalled();
    expect(queueUpsertMock).not.toHaveBeenCalled();
  });

  test("rejects unknown entryKey", async () => {
    const mgr = new ScheduleManager(mockDb);
    await expect(
      mgr.updateCron("does-not-exist", "0 0 * * *"),
    ).rejects.toThrow(/Unknown schedule entry/);
  });

  test("skips scheduler upsert when entry is disabled in DB", async () => {
    systemConfigRows.set("schedule.brain.enabled", false);
    const mgr = new ScheduleManager(mockDb);
    const status = await mgr.updateCron("learning-brain-daily", "*/30 * * * *");
    expect(status.enabled).toBe(false);
    expect(queueUpsertMock).not.toHaveBeenCalled();
  });
});

describe("ScheduleManager.setEnabled", () => {
  test("enabled=false removes scheduler", async () => {
    const mgr = new ScheduleManager(mockDb);
    await mgr.setEnabled("learning-brain-daily", false);
    expect(queueRemoveMock).toHaveBeenCalledWith("learning-brain-daily");
    expect(queueUpsertMock).not.toHaveBeenCalled();
  });

  test("enabled=true re-upserts scheduler with current pattern", async () => {
    systemConfigRows.set("schedule.brain.enabled", false);
    systemConfigRows.set("schedule.brain.cron", "*/10 * * * *");
    const mgr = new ScheduleManager(mockDb);
    await mgr.setEnabled("learning-brain-daily", true);
    expect(queueUpsertMock).toHaveBeenCalledWith(
      "learning-brain-daily",
      { pattern: "*/10 * * * *", tz: "UTC" },
      expect.any(Object),
    );
    expect(queueRemoveMock).not.toHaveBeenCalled();
  });
});

describe("ScheduleManager.triggerNow", () => {
  test("enqueues one-off job when cooldown is clear", async () => {
    const mgr = new ScheduleManager(mockDb);
    const jobId = await mgr.triggerNow("learning-brain-daily");
    expect(jobId).toBe("job-1");
    expect(redisSetMock).toHaveBeenCalledWith(
      "schedule:trigger:cooldown:learning-brain-daily",
      "1",
      "EX",
      60,
      "NX",
    );
    expect(queueAddMock).toHaveBeenCalled();
  });

  test("throws when cooldown is active", async () => {
    redisSetMock.mockResolvedValueOnce(null); // SET NX returned nil → key existed
    const mgr = new ScheduleManager(mockDb);
    await expect(mgr.triggerNow("learning-brain-daily")).rejects.toThrow(
      /cooldown active/i,
    );
    expect(queueAddMock).not.toHaveBeenCalled();
  });
});

describe("ScheduleManager.list", () => {
  test("returns all registered schedules with nextRunAt", async () => {
    const mgr = new ScheduleManager(mockDb);
    const list = await mgr.list();
    expect(list).toHaveLength(SCHEDULE_REGISTRY.length);
    for (const s of list) {
      expect(s.pattern).toBeTruthy();
      expect(s.nextRunAt).toBeTruthy(); // all enabled by default
    }
  });

  test("disabled schedule has nextRunAt === null", async () => {
    systemConfigRows.set("schedule.brain.enabled", false);
    const mgr = new ScheduleManager(mockDb);
    const list = await mgr.list();
    const brain = list.find((s) => s.entryKey === "learning-brain-daily")!;
    expect(brain.enabled).toBe(false);
    expect(brain.nextRunAt).toBeNull();
  });
});
