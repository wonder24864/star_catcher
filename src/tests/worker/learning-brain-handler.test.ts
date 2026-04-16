/**
 * Unit Tests: Learning Brain Handler
 *
 * Verifies:
 * - __all__ fanout queries active students and enqueues individual jobs
 * - Per-student mode: acquires lock, runs Brain, enqueues, writes AdminLog
 * - Lock not acquired → skip
 * - Lock released in finally (even on error)
 * - Empty decision → no enqueue, AdminLog still written
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Mocks ──────────────────────────────────────

const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisGet = vi.fn().mockResolvedValue(null);

vi.mock("@/lib/infra/redis", () => ({
  redis: {
    set: (...args: unknown[]) => mockRedisSet(...args),
    del: (...args: unknown[]) => mockRedisDel(...args),
    get: (...args: unknown[]) => mockRedisGet(...args),
  },
}));

const mockDbMasteryStateFindMany = vi.fn();
const mockDbReviewScheduleFindMany = vi.fn();

vi.mock("@/lib/infra/db", () => ({
  db: {
    masteryState: { findMany: (...args: unknown[]) => mockDbMasteryStateFindMany(...args) },
    reviewSchedule: { findMany: (...args: unknown[]) => mockDbReviewScheduleFindMany(...args) },
  },
}));

const mockEnqueueLearningBrain = vi.fn().mockResolvedValue("job-1");
const mockEnqueueInterventionPlanning = vi.fn().mockResolvedValue("job-2");
const mockEnqueueMasteryEvaluation = vi.fn().mockResolvedValue("job-3");

vi.mock("@/lib/infra/queue", () => ({
  enqueueLearningBrain: (...args: unknown[]) => mockEnqueueLearningBrain(...args),
  enqueueInterventionPlanning: (...args: unknown[]) => mockEnqueueInterventionPlanning(...args),
  enqueueMasteryEvaluation: (...args: unknown[]) => mockEnqueueMasteryEvaluation(...args),
}));

const mockRunLearningBrain = vi.fn();

vi.mock("@/lib/domain/brain", () => ({
  runLearningBrain: (...args: unknown[]) => mockRunLearningBrain(...args),
  cooldownKey: (studentId: string) => `brain:intervention-cooldown:${studentId}`,
  getCooldownTTL: (tier: number) => [21600, 43200, 86400][Math.min(tier, 3) - 1] ?? 21600,
  parseCooldownValue: (raw: string | null) => {
    if (!raw) return null;
    try { const p = JSON.parse(raw); return (typeof p.tier === "number" && typeof p.setAt === "string") ? p : null; } catch { return null; }
  },
  MAX_COOLDOWN_TIER: 3,
}));

const mockLogAdminAction = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/domain/admin-log", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

vi.mock("@/lib/domain/memory/student-memory", () => ({
  StudentMemoryImpl: vi.fn(),
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  }),
}));

import { handleLearningBrain } from "@/worker/handlers/learning-brain";
import type { Job } from "bullmq";
import type { LearningBrainJobData } from "@/lib/infra/queue/types";

function makeJob(data: LearningBrainJobData): Job<LearningBrainJobData> {
  return { id: "test-job-1", data } as Job<LearningBrainJobData>;
}

// ─── Tests ──────────────────────────────────────

describe("Learning Brain Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(1);
    mockDbMasteryStateFindMany.mockResolvedValue([]);
    mockDbReviewScheduleFindMany.mockResolvedValue([]);
  });

  // ── __all__ fanout ──

  test("__all__ queries active students and enqueues individual jobs", async () => {
    mockDbMasteryStateFindMany.mockResolvedValue([
      { studentId: "s1" },
      { studentId: "s2" },
    ]);
    mockDbReviewScheduleFindMany.mockResolvedValue([
      { studentId: "s2" },
      { studentId: "s3" },
    ]);

    await handleLearningBrain(
      makeJob({ studentId: "__all__", userId: "system", locale: "zh" }),
    );

    // Should enqueue 3 distinct students (s1, s2, s3)
    expect(mockEnqueueLearningBrain).toHaveBeenCalledTimes(3);
    const enqueuedStudentIds = mockEnqueueLearningBrain.mock.calls.map(
      (call: unknown[]) => (call[0] as LearningBrainJobData).studentId,
    );
    expect(new Set(enqueuedStudentIds)).toEqual(new Set(["s1", "s2", "s3"]));
  });

  test("__all__ with no active students enqueues nothing", async () => {
    await handleLearningBrain(
      makeJob({ studentId: "__all__", userId: "system", locale: "zh" }),
    );

    expect(mockEnqueueLearningBrain).not.toHaveBeenCalled();
  });

  // ── Per-student: lock acquired ──

  test("runs Brain and enqueues agents when lock acquired", async () => {
    mockRunLearningBrain.mockResolvedValue({
      agentsToLaunch: [
        {
          jobName: "intervention-planning",
          data: { studentId: "s1", knowledgePointIds: ["kp1"], userId: "user-1", locale: "zh" },
          reason: "1 weak point",
        },
      ],
      eventsProcessed: 1,
      skipped: [],
    });

    await handleLearningBrain(
      makeJob({ studentId: "s1", userId: "user-1", locale: "zh" }),
    );

    // Lock acquired
    expect(mockRedisSet).toHaveBeenCalledWith(
      "learning-brain:lock:s1", "1", "EX", 300, "NX",
    );
    // Brain ran
    expect(mockRunLearningBrain).toHaveBeenCalled();
    // Agent enqueued
    expect(mockEnqueueInterventionPlanning).toHaveBeenCalledTimes(1);
    // AdminLog written
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "brain-run",
      "s1",
      expect.objectContaining({ studentId: "s1", eventsProcessed: 1 }),
    );
    // Lock released
    expect(mockRedisDel).toHaveBeenCalledWith("learning-brain:lock:s1");
  });

  // ── Per-student: lock not acquired ──

  test("skips when lock not acquired", async () => {
    mockRedisSet.mockResolvedValue(null); // Lock failed

    await handleLearningBrain(
      makeJob({ studentId: "s1", userId: "user-1", locale: "zh" }),
    );

    expect(mockRunLearningBrain).not.toHaveBeenCalled();
    expect(mockLogAdminAction).not.toHaveBeenCalled();
    expect(mockRedisDel).not.toHaveBeenCalled();
  });

  // ── Empty decision ──

  test("writes AdminLog even with empty decision", async () => {
    mockRunLearningBrain.mockResolvedValue({
      agentsToLaunch: [],
      eventsProcessed: 0,
      skipped: [],
    });

    await handleLearningBrain(
      makeJob({ studentId: "s1", userId: "user-1", locale: "zh" }),
    );

    expect(mockEnqueueInterventionPlanning).not.toHaveBeenCalled();
    expect(mockEnqueueMasteryEvaluation).not.toHaveBeenCalled();
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      "brain-run",
      "s1",
      expect.objectContaining({ eventsProcessed: 0, agentsLaunched: [] }),
    );
    expect(mockRedisDel).toHaveBeenCalled();
  });

  // ── Lock released on error ──

  test("releases lock even if Brain throws", async () => {
    mockRunLearningBrain.mockRejectedValue(new Error("Brain exploded"));

    await expect(
      handleLearningBrain(
        makeJob({ studentId: "s1", userId: "user-1", locale: "zh" }),
      ),
    ).rejects.toThrow("Brain exploded");

    // Lock still released
    expect(mockRedisDel).toHaveBeenCalledWith("learning-brain:lock:s1");
  });

  // ── Both agent types ──

  test("enqueues both intervention-planning and mastery-evaluation", async () => {
    mockRunLearningBrain.mockResolvedValue({
      agentsToLaunch: [
        {
          jobName: "intervention-planning",
          data: { studentId: "s1", knowledgePointIds: ["kp1"], userId: "u1", locale: "zh" },
          reason: "weak",
        },
        {
          jobName: "mastery-evaluation",
          data: { studentId: "s1", knowledgePointId: "kp2", reviewScheduleId: "rs1", userId: "u1", locale: "zh" },
          reason: "overdue",
        },
      ],
      eventsProcessed: 2,
      skipped: [],
    });

    await handleLearningBrain(
      makeJob({ studentId: "s1", userId: "u1", locale: "zh" }),
    );

    expect(mockEnqueueInterventionPlanning).toHaveBeenCalledTimes(1);
    expect(mockEnqueueMasteryEvaluation).toHaveBeenCalledTimes(1);
  });
});
