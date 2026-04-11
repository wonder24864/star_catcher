/**
 * Unit Tests: Report Router
 * Tests weeklyReport/monthlyReport/knowledgeProgress with mock DB.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db", () => ({
  db: {
    masteryState: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    reviewSchedule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    interventionHistory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    familyMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));
vi.mock("@/lib/infra/redis", () => ({
  redis: {
    zremrangebyscore: vi.fn(),
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn(),
    expire: vi.fn(),
    zrange: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/infra/queue", () => ({
  enqueueRecognition: vi.fn(),
  enqueueCorrectionPhotos: vi.fn(),
  enqueueHelpGeneration: vi.fn(),
  enqueueQuestionUnderstanding: vi.fn(),
  enqueueDiagnosis: vi.fn(),
}));

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { db } from "@/lib/infra/db";

const mockDb = db as unknown as {
  masteryState: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
  };
  reviewSchedule: { findMany: ReturnType<typeof vi.fn> };
  interventionHistory: { findMany: ReturnType<typeof vi.fn> };
  familyMember: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

const createCaller = createCallerFactory(appRouter);

const studentSession = { userId: "student-1", role: "STUDENT", grade: null, locale: "zh" };
const parentSession = { userId: "parent-1", role: "PARENT", grade: null, locale: "zh" };

function createCtx(session: Record<string, unknown>) {
  return { db: mockDb as never, session: session as never };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: count returns 0
  mockDb.masteryState.count.mockResolvedValue(0);
  mockDb.masteryState.findMany.mockResolvedValue([]);
  mockDb.reviewSchedule.findMany.mockResolvedValue([]);
  mockDb.interventionHistory.findMany.mockResolvedValue([]);
});

// ── weeklyReport ──

describe("report.weeklyReport", () => {
  test("student can view own report", async () => {
    const caller = createCaller(createCtx(studentSession));
    const result = await caller.report.weeklyReport({});

    expect(result.period).toBe(7);
    expect(result.summary).toEqual({
      newMastered: 0,
      newRegressed: 0,
      newErrors: 0,
      reviewsScheduled: 0,
      reviewsCompleted: 0,
    });
    expect(result.masteryTrend).toHaveLength(7);
    expect(result.weakPoints).toEqual([]);
  });

  test("returns correct summary counts", async () => {
    // newMastered=2, newRegressed=1, newErrors=3
    mockDb.masteryState.count
      .mockResolvedValueOnce(2) // MASTERED
      .mockResolvedValueOnce(1) // REGRESSED
      .mockResolvedValueOnce(3); // NEW_ERROR

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.report.weeklyReport({});

    expect(result.summary.newMastered).toBe(2);
    expect(result.summary.newRegressed).toBe(1);
    expect(result.summary.newErrors).toBe(3);
  });

  test("parent can view child report via family", async () => {
    mockDb.familyMember.findMany.mockResolvedValue([{ familyId: "fam-1" }]);
    mockDb.familyMember.findFirst.mockResolvedValue({ userId: "student-1", familyId: "fam-1" });

    const caller = createCaller(createCtx(parentSession));
    const result = await caller.report.weeklyReport({ studentId: "student-1" });

    expect(result.period).toBe(7);
  });

  test("parent denied if student not in family", async () => {
    mockDb.familyMember.findMany.mockResolvedValue([{ familyId: "fam-1" }]);
    mockDb.familyMember.findFirst.mockResolvedValue(null);

    const caller = createCaller(createCtx(parentSession));
    await expect(
      caller.report.weeklyReport({ studentId: "other-student" }),
    ).rejects.toThrow("FORBIDDEN");
  });

  test("builds daily mastery trend", async () => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    // Last findMany call is dailyMastered
    mockDb.masteryState.findMany
      .mockResolvedValueOnce([]) // weakPoints
      .mockResolvedValueOnce([
        { masteredAt: today },
        { masteredAt: today },
        { masteredAt: yesterday },
      ]); // dailyMastered

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.report.weeklyReport({});

    const todayKey = today.toISOString().slice(0, 10);
    const todayEntry = result.masteryTrend.find((t: { date: string }) => t.date === todayKey);
    expect(todayEntry?.count).toBe(2);
  });

  test("review completion rate", async () => {
    mockDb.reviewSchedule.findMany.mockResolvedValue([
      { id: "rs-1" },
      { id: "rs-2" },
      { id: "rs-3" },
    ]);
    mockDb.interventionHistory.findMany.mockResolvedValue([
      { knowledgePointId: "kp-1" },
      { knowledgePointId: "kp-2" },
    ]);

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.report.weeklyReport({});

    expect(result.summary.reviewsScheduled).toBe(3);
    expect(result.summary.reviewsCompleted).toBe(2);
  });
});

// ── monthlyReport ──

describe("report.monthlyReport", () => {
  test("returns 30-day period", async () => {
    const caller = createCaller(createCtx(studentSession));
    const result = await caller.report.monthlyReport({});

    expect(result.period).toBe(30);
    expect(result.masteryTrend).toHaveLength(30);
  });
});

// ── knowledgeProgress ──

describe("report.knowledgeProgress", () => {
  test("returns mastery + interventions for a KP", async () => {
    mockDb.masteryState.findUnique.mockResolvedValue({
      id: "ms-1",
      studentId: "student-1",
      knowledgePointId: "kp-1",
      status: "REVIEWING",
      totalAttempts: 5,
      correctAttempts: 3,
      knowledgePoint: { name: "分数加法", subject: "MATH" },
    });
    mockDb.interventionHistory.findMany.mockResolvedValue([
      { id: "ih-1", type: "DIAGNOSIS", content: {}, createdAt: new Date() },
      { id: "ih-2", type: "REVIEW", content: {}, createdAt: new Date() },
    ]);

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.report.knowledgeProgress({
      knowledgePointId: "kp-1",
    });

    expect(result.mastery.status).toBe("REVIEWING");
    expect(result.interventions).toHaveLength(2);
  });

  test("throws NOT_FOUND if no mastery state", async () => {
    mockDb.masteryState.findUnique.mockResolvedValue(null);

    const caller = createCaller(createCtx(studentSession));
    await expect(
      caller.report.knowledgeProgress({ knowledgePointId: "kp-999" }),
    ).rejects.toThrow("No mastery state found");
  });

  test("parent can view child KP progress", async () => {
    mockDb.familyMember.findMany.mockResolvedValue([{ familyId: "fam-1" }]);
    mockDb.familyMember.findFirst.mockResolvedValue({ userId: "student-1", familyId: "fam-1" });
    mockDb.masteryState.findUnique.mockResolvedValue({
      id: "ms-1",
      studentId: "student-1",
      knowledgePointId: "kp-1",
      status: "MASTERED",
      knowledgePoint: { name: "分数加法", subject: "MATH" },
    });
    mockDb.interventionHistory.findMany.mockResolvedValue([]);

    const caller = createCaller(createCtx(parentSession));
    const result = await caller.report.knowledgeProgress({
      studentId: "student-1",
      knowledgePointId: "kp-1",
    });

    expect(result.mastery.status).toBe("MASTERED");
  });
});
