/**
 * Unit Tests: Weakness Profile Handler
 *
 * Tests fan-out mode, single-student computation, and AdminLog.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Mocks (vi.hoisted to avoid init order issues) ──

const { mockDb, mockEnqueueWeaknessProfile, mockMemory, mockLogAdminAction } = vi.hoisted(() => {
  const mockDb = {
    masteryState: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    reviewSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const mockEnqueueWeaknessProfile = vi.fn().mockResolvedValue("job-1");
  const mockMemory = {
    getWeakPoints: vi.fn().mockResolvedValue([]),
    getInterventionHistory: vi.fn().mockResolvedValue([]),
    saveWeaknessProfile: vi.fn().mockResolvedValue({
      id: "wp-1",
      studentId: "s1",
      tier: "PERIODIC",
      data: { weakPoints: [] },
      generatedAt: new Date(),
      validUntil: null,
    }),
  };
  const mockLogAdminAction = vi.fn().mockResolvedValue(undefined);
  return { mockDb, mockEnqueueWeaknessProfile, mockMemory, mockLogAdminAction };
});

vi.mock("@/lib/infra/db", () => ({ db: mockDb }));
vi.mock("@/lib/infra/queue", () => ({
  enqueueWeaknessProfile: (...args: unknown[]) => mockEnqueueWeaknessProfile(...args),
}));
vi.mock("@/lib/domain/memory/student-memory", () => ({
  StudentMemoryImpl: vi.fn().mockImplementation(() => mockMemory),
}));
vi.mock("@/lib/domain/admin-log", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

// Mock logger
vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }),
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

import { handleWeaknessProfile } from "@/worker/handlers/weakness-profile";
import type { Job } from "bullmq";
import type { WeaknessProfileJobData } from "@/lib/infra/queue/types";

function makeJob(data: WeaknessProfileJobData): Job<WeaknessProfileJobData> {
  return { id: "test-job-1", data } as Job<WeaknessProfileJobData>;
}

// ─── Tests ─────────────────────────────────────

describe("handleWeaknessProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("fan-out mode enqueues individual jobs for active students", async () => {
    mockDb.masteryState.findMany.mockResolvedValue([
      { studentId: "s1" },
      { studentId: "s2" },
    ]);

    await handleWeaknessProfile(
      makeJob({ studentId: "__all__", userId: "system", locale: "zh" }),
    );

    expect(mockEnqueueWeaknessProfile).toHaveBeenCalledTimes(2);
    expect(mockEnqueueWeaknessProfile).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "s1" }),
    );
    expect(mockEnqueueWeaknessProfile).toHaveBeenCalledWith(
      expect.objectContaining({ studentId: "s2" }),
    );
  });

  test("fan-out skips archived students", async () => {
    mockDb.masteryState.findMany.mockResolvedValue([]);

    await handleWeaknessProfile(
      makeJob({ studentId: "__all__", userId: "system", locale: "zh" }),
    );

    expect(mockEnqueueWeaknessProfile).not.toHaveBeenCalled();
  });

  test("single student mode computes and saves profile", async () => {
    mockMemory.getWeakPoints.mockResolvedValue([
      {
        id: "ms-1",
        studentId: "s1",
        knowledgePointId: "kp-1",
        status: "NEW_ERROR",
        totalAttempts: 5,
        correctAttempts: 1,
        lastAttemptAt: new Date(),
        masteredAt: null,
        version: 1,
        archived: false,
      },
    ]);
    mockMemory.getInterventionHistory.mockResolvedValue([]);

    await handleWeaknessProfile(
      makeJob({ studentId: "s1", userId: "system", locale: "zh" }),
    );

    // saveWeaknessProfile was called
    expect(mockMemory.saveWeaknessProfile).toHaveBeenCalledTimes(1);
    expect(mockMemory.saveWeaknessProfile).toHaveBeenCalledWith(
      "s1",
      "PERIODIC",
      expect.objectContaining({
        weakPoints: expect.arrayContaining([
          expect.objectContaining({ kpId: "kp-1" }),
        ]),
      }),
      expect.any(Date), // validUntil for PERIODIC
    );

    // AdminLog was written
    expect(mockLogAdminAction).toHaveBeenCalledWith(
      expect.anything(),
      "system",
      "weakness-profile",
      "s1",
      expect.objectContaining({
        tier: "PERIODIC",
        weakPointCount: 1,
      }),
    );
  });

  test("GLOBAL tier has no expiry", async () => {
    mockMemory.getWeakPoints.mockResolvedValue([]);

    await handleWeaknessProfile(
      makeJob({ studentId: "s1", userId: "admin", locale: "zh", tier: "GLOBAL" }),
    );

    expect(mockMemory.saveWeaknessProfile).toHaveBeenCalledWith(
      "s1",
      "GLOBAL",
      expect.anything(),
      undefined, // no validUntil
    );
  });
});
