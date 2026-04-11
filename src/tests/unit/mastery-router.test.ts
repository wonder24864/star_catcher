/**
 * Unit Tests: Mastery Router
 * Tests mastery list/detail/weakPoints/stats procedures with mock DB.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted — cannot reference outer variables
vi.mock("@/lib/infra/db", () => ({
  db: {
    masteryState: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      groupBy: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    interventionHistory: {
      findMany: vi.fn(),
    },
    errorQuestion: {
      findMany: vi.fn(),
    },
    familyMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
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
  masteryState: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  interventionHistory: { findMany: ReturnType<typeof vi.fn> };
  errorQuestion: { findMany: ReturnType<typeof vi.fn> };
  familyMember: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

const createCaller = createCallerFactory(appRouter);

const studentSession = { userId: "student-1", role: "STUDENT", grade: null, locale: "zh" };
const parentSession = { userId: "parent-1", role: "PARENT", grade: null, locale: "zh" };

function createCtx(session: Record<string, unknown>) {
  return { db: mockDb as never, session: session as never };
}

// ── Test data factories ──

function makeMasteryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ms-1",
    studentId: "student-1",
    knowledgePointId: "kp-1",
    status: "NEW_ERROR",
    totalAttempts: 1,
    correctAttempts: 0,
    lastAttemptAt: null,
    masteredAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    knowledgePoint: {
      id: "kp-1",
      name: "Test KP",
      subject: "MATH",
      grade: "PRIMARY_3",
      difficulty: 3,
      importance: 3,
      description: null,
      parent: null,
    },
    ...overrides,
  };
}

describe("MasteryRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── mastery.list ──

  describe("list", () => {
    test("student can list own mastery states", async () => {
      const items = [makeMasteryRow()];
      mockDb.masteryState.findMany.mockResolvedValue(items);
      mockDb.masteryState.count.mockResolvedValue(1);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.mastery.list({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.status).toBe("NEW_ERROR");
      expect(result.items[0]!.knowledgePointName).toBe("Test KP");
      expect(result.total).toBe(1);
    });

    test("filters by status", async () => {
      mockDb.masteryState.findMany.mockResolvedValue([]);

      const caller = createCaller(createCtx(studentSession));
      await caller.mastery.list({ status: "MASTERED" });

      expect(mockDb.masteryState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "MASTERED" }),
        }),
      );
    });

    test("filters by subject", async () => {
      mockDb.masteryState.findMany.mockResolvedValue([]);

      const caller = createCaller(createCtx(studentSession));
      await caller.mastery.list({ subject: "MATH" });

      expect(mockDb.masteryState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            knowledgePoint: { subject: "MATH", deletedAt: null },
          }),
        }),
      );
    });

    test("parent can view child mastery via family relation", async () => {
      mockDb.familyMember.findMany.mockResolvedValue([{ familyId: "fam-1" }]);
      mockDb.familyMember.findFirst.mockResolvedValue({ familyId: "fam-1" });
      mockDb.masteryState.findMany.mockResolvedValue([
        makeMasteryRow({ studentId: "student-1" }),
      ]);

      const caller = createCaller(createCtx(parentSession));
      const result = await caller.mastery.list({ studentId: "student-1" });

      expect(result.items).toHaveLength(1);
    });

    test("parent denied access to unrelated student", async () => {
      mockDb.familyMember.findMany.mockResolvedValue([{ familyId: "fam-1" }]);
      mockDb.familyMember.findFirst.mockResolvedValue(null); // Not in family

      const caller = createCaller(createCtx(parentSession));
      await expect(
        caller.mastery.list({ studentId: "stranger-student" }),
      ).rejects.toThrow("FORBIDDEN");
    });
  });

  // ── mastery.detail ──

  describe("detail", () => {
    test("returns mastery + interventions + error questions", async () => {
      mockDb.masteryState.findUnique.mockResolvedValue(makeMasteryRow());
      mockDb.interventionHistory.findMany.mockResolvedValue([
        {
          id: "int-1",
          type: "DIAGNOSIS",
          content: { errorPattern: "CONCEPT_CONFUSION" },
          agentId: "diagnosis",
          skillId: null,
          createdAt: new Date(),
        },
      ]);
      mockDb.errorQuestion.findMany.mockResolvedValue([
        {
          id: "eq-1",
          content: "2+2=?",
          studentAnswer: "5",
          correctAnswer: "4",
          subject: "MATH",
          createdAt: new Date(),
        },
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.mastery.detail({ knowledgePointId: "kp-1" });

      expect(result.mastery.status).toBe("NEW_ERROR");
      expect(result.interventions).toHaveLength(1);
      expect(result.interventions[0]!.type).toBe("DIAGNOSIS");
      expect(result.errorQuestions).toHaveLength(1);
    });

    test("throws NOT_FOUND when no mastery state", async () => {
      mockDb.masteryState.findUnique.mockResolvedValue(null);

      const caller = createCaller(createCtx(studentSession));
      await expect(
        caller.mastery.detail({ knowledgePointId: "kp-unknown" }),
      ).rejects.toThrow("NOT_FOUND");
    });
  });

  // ── mastery.weakPoints ──

  describe("weakPoints", () => {
    test("returns only weak statuses", async () => {
      mockDb.masteryState.findMany.mockResolvedValue([
        makeMasteryRow({ status: "NEW_ERROR" }),
        makeMasteryRow({ id: "ms-2", status: "REGRESSED" }),
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.mastery.weakPoints({});

      expect(result).toHaveLength(2);
      expect(mockDb.masteryState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["NEW_ERROR", "CORRECTED", "REGRESSED"] },
          }),
        }),
      );
    });
  });

  // ── mastery.stats ──

  describe("stats", () => {
    test("returns grouped counts", async () => {
      mockDb.masteryState.groupBy.mockResolvedValue([
        { status: "NEW_ERROR", _count: 3 },
        { status: "MASTERED", _count: 5 },
      ]);
      mockDb.$queryRaw.mockResolvedValue([
        { subject: "MATH", count: BigInt(5) },
        { subject: "CHINESE", count: BigInt(3) },
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.mastery.stats({});

      expect(result.byStatus).toHaveLength(2);
      expect(result.bySubject).toHaveLength(2);
      expect(result.total).toBe(8);
      expect(result.bySubject[0]!.count).toBe(5);
    });
  });
});
