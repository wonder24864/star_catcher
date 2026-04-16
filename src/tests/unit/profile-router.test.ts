/**
 * Unit Tests: Profile Router
 * Tests learningJourney / masteryDashboard / historicalProgress procedures.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted — cannot reference outer variables
vi.mock("@/lib/infra/db", () => ({
  db: {
    masteryState: {
      findMany: vi.fn(),
    },
    masteryStateHistory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    interventionHistory: {
      findMany: vi.fn(),
    },
    errorQuestion: {
      findMany: vi.fn(),
    },
    homeworkSession: {
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
  masteryState: { findMany: ReturnType<typeof vi.fn> };
  masteryStateHistory: { findMany: ReturnType<typeof vi.fn> };
  interventionHistory: { findMany: ReturnType<typeof vi.fn> };
  errorQuestion: { findMany: ReturnType<typeof vi.fn> };
  homeworkSession: { findMany: ReturnType<typeof vi.fn> };
  familyMember: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

const createCaller = createCallerFactory(appRouter);

const studentSession = { userId: "student-1", role: "STUDENT", grade: null, locale: "zh" };
const parentSession = { userId: "parent-1", role: "PARENT", grade: null, locale: "zh" };

function createCtx(session: Record<string, unknown>) {
  const pino = require("pino");
  return { db: mockDb as never, session: session as never, requestId: "test", log: pino({ level: "silent" }) };
}

function setupParentFamilyAccess() {
  mockDb.familyMember.findMany.mockResolvedValueOnce([{ familyId: "fam-1" }]);
  mockDb.familyMember.findFirst.mockResolvedValueOnce({ userId: "student-1", familyId: "fam-1" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── learningJourney ────────────────────────────

describe("ProfileRouter", () => {
  describe("learningJourney", () => {
    test("student can view own learning journey", async () => {
      const now = new Date();
      mockDb.errorQuestion.findMany.mockResolvedValueOnce([
        {
          createdAt: now,
          subject: "MATH",
          content: "2+2=?",
          knowledgeMappings: [{ knowledgePoint: { name: "Addition" } }],
        },
      ]);
      mockDb.masteryState.findMany.mockResolvedValueOnce([
        {
          masteredAt: new Date(now.getTime() - 1000),
          knowledgePoint: { name: "Subtraction", subject: "MATH" },
        },
      ]);
      mockDb.interventionHistory.findMany.mockResolvedValueOnce([
        {
          createdAt: new Date(now.getTime() - 2000),
          type: "DIAGNOSIS",
          knowledgePoint: { name: "Fractions", subject: "MATH" },
        },
      ]);
      mockDb.homeworkSession.findMany.mockResolvedValueOnce([
        {
          createdAt: new Date(now.getTime() - 3000),
          subject: "MATH",
          finalScore: 85,
          title: "Homework 1",
        },
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.learningJourney({});

      expect(result.events).toHaveLength(4);
      // Should be sorted by timestamp desc
      expect(result.events[0].type).toBe("NEW_ERROR");
      expect(result.events[1].type).toBe("MASTERED");
      expect(result.events[2].type).toBe("INTERVENTION_DIAGNOSIS");
      expect(result.events[3].type).toBe("HOMEWORK_COMPLETED");
    });

    test("parent can view child journey via family relation", async () => {
      setupParentFamilyAccess();
      mockDb.errorQuestion.findMany.mockResolvedValueOnce([]);
      mockDb.masteryState.findMany.mockResolvedValueOnce([]);
      mockDb.interventionHistory.findMany.mockResolvedValueOnce([]);
      mockDb.homeworkSession.findMany.mockResolvedValueOnce([
        {
          createdAt: new Date(),
          subject: "ENGLISH",
          finalScore: 90,
          title: "English HW",
        },
      ]);

      const caller = createCaller(createCtx(parentSession));
      const result = await caller.profile.learningJourney({ studentId: "student-1" });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe("HOMEWORK_COMPLETED");
    });

    test("parent denied access to unrelated student", async () => {
      mockDb.familyMember.findMany.mockResolvedValueOnce([{ familyId: "fam-1" }]);
      mockDb.familyMember.findFirst.mockResolvedValueOnce(null);

      const caller = createCaller(createCtx(parentSession));
      await expect(
        caller.profile.learningJourney({ studentId: "stranger-1" }),
      ).rejects.toThrow("FORBIDDEN");
    });

    test("merges events from 4 sources sorted by timestamp desc", async () => {
      const base = Date.now();
      mockDb.errorQuestion.findMany.mockResolvedValueOnce([
        { createdAt: new Date(base - 100), subject: "MATH", content: "q1", knowledgeMappings: [] },
      ]);
      mockDb.masteryState.findMany.mockResolvedValueOnce([
        { masteredAt: new Date(base - 300), knowledgePoint: { name: "KP1", subject: "MATH" } },
      ]);
      mockDb.interventionHistory.findMany.mockResolvedValueOnce([
        { createdAt: new Date(base), type: "HINT", knowledgePoint: { name: "KP2", subject: "MATH" } },
      ]);
      mockDb.homeworkSession.findMany.mockResolvedValueOnce([
        { createdAt: new Date(base - 200), subject: "MATH", finalScore: 75, title: "HW" },
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.learningJourney({});

      expect(result.events).toHaveLength(4);
      // Newest first: HINT(base), ERROR(base-100), HW(base-200), MASTERED(base-300)
      expect(result.events[0].type).toBe("INTERVENTION_HINT");
      expect(result.events[1].type).toBe("NEW_ERROR");
      expect(result.events[2].type).toBe("HOMEWORK_COMPLETED");
      expect(result.events[3].type).toBe("MASTERED");
    });

    test("returns empty array when no data", async () => {
      mockDb.errorQuestion.findMany.mockResolvedValueOnce([]);
      mockDb.masteryState.findMany.mockResolvedValueOnce([]);
      mockDb.interventionHistory.findMany.mockResolvedValueOnce([]);
      mockDb.homeworkSession.findMany.mockResolvedValueOnce([]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.learningJourney({});

      expect(result.events).toEqual([]);
    });

    test("limits to 100 events", async () => {
      const now = Date.now();
      const manyErrors = Array.from({ length: 50 }, (_, i) => ({
        createdAt: new Date(now - i * 1000),
        subject: "MATH",
        content: `q${i}`,
        knowledgeMappings: [],
      }));
      const manyMastery = Array.from({ length: 50 }, (_, i) => ({
        masteredAt: new Date(now - (50 + i) * 1000),
        knowledgePoint: { name: `KP-${i}`, subject: "MATH" },
      }));
      // 50 errors + 50 mastery + interventions + homework > 100
      mockDb.errorQuestion.findMany.mockResolvedValueOnce(manyErrors);
      mockDb.masteryState.findMany.mockResolvedValueOnce(manyMastery);
      mockDb.interventionHistory.findMany.mockResolvedValueOnce(
        Array.from({ length: 20 }, (_, i) => ({
          createdAt: new Date(now - (100 + i) * 1000),
          type: "REVIEW",
          knowledgePoint: { name: `KP-R${i}`, subject: "MATH" },
        })),
      );
      mockDb.homeworkSession.findMany.mockResolvedValueOnce([]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.learningJourney({});

      expect(result.events.length).toBeLessThanOrEqual(100);
    });
  });

  // ─── masteryDashboard ───────────────────────────

  describe("masteryDashboard", () => {
    test("returns mastery counts grouped by subject", async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([
        { subject: "MATH", total: BigInt(10), mastered: BigInt(5), inProgress: BigInt(3), newError: BigInt(2) },
        { subject: "ENGLISH", total: BigInt(4), mastered: BigInt(2), inProgress: BigInt(1), newError: BigInt(1) },
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.masteryDashboard({});

      expect(result.bySubject).toEqual({
        MATH: { total: 10, mastered: 5, inProgress: 3, newError: 2 },
        ENGLISH: { total: 4, mastered: 2, inProgress: 1, newError: 1 },
      });
    });

    test("correct counting per status bucket", async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([
        { subject: "MATH", total: BigInt(6), mastered: BigInt(2), inProgress: BigInt(3), newError: BigInt(1) },
      ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.masteryDashboard({});

      const math = result.bySubject["MATH"];
      expect(math.mastered + math.inProgress + math.newError).toBeLessThanOrEqual(math.total);
    });

    test("parent can view child dashboard via family", async () => {
      setupParentFamilyAccess();
      mockDb.$queryRaw.mockResolvedValueOnce([
        { subject: "CHINESE", total: BigInt(3), mastered: BigInt(1), inProgress: BigInt(1), newError: BigInt(1) },
      ]);

      const caller = createCaller(createCtx(parentSession));
      const result = await caller.profile.masteryDashboard({ studentId: "student-1" });

      expect(result.bySubject["CHINESE"]).toBeDefined();
    });

    test("returns empty record when no mastery data", async () => {
      mockDb.$queryRaw.mockResolvedValueOnce([]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.masteryDashboard({});

      expect(Object.keys(result.bySubject)).toHaveLength(0);
    });
  });

  // ─── historicalProgress ─────────────────────────

  describe("historicalProgress", () => {
    test("returns cumulative daily counts for 30d period", async () => {
      // Baseline: 5 total, 2 mastered before period
      mockDb.$queryRaw
        .mockResolvedValueOnce([{ baseTotal: BigInt(5), baseMastered: BigInt(2) }])
        .mockResolvedValueOnce([
          { date: thirtyDaysAgoPlus(5), newTotal: BigInt(2), newMastered: BigInt(1) },
          { date: thirtyDaysAgoPlus(10), newTotal: BigInt(1), newMastered: BigInt(0) },
        ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.historicalProgress({ period: "30d" });

      expect(result.dailyCounts.length).toBeGreaterThan(0);
      // First day should have baseline values
      expect(result.dailyCounts[0].total).toBe(5);
      expect(result.dailyCounts[0].mastered).toBe(2);
      // After day 5 delta: 5+2=7 total, 2+1=3 mastered
      const day5 = result.dailyCounts.find((d) => d.date === dateStr(thirtyDaysAgoPlus(5)));
      if (day5) {
        expect(day5.total).toBe(7);
        expect(day5.mastered).toBe(3);
      }
    });

    test("returns cumulative daily counts for 90d period", async () => {
      mockDb.$queryRaw
        .mockResolvedValueOnce([{ baseTotal: BigInt(0), baseMastered: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.historicalProgress({ period: "90d" });

      // Should have ~91 days of entries
      expect(result.dailyCounts.length).toBeGreaterThanOrEqual(90);
      // All zeros since no data
      for (const day of result.dailyCounts) {
        expect(day.total).toBe(0);
        expect(day.mastered).toBe(0);
      }
    });

    test("fills date gaps with previous cumulative value", async () => {
      mockDb.$queryRaw
        .mockResolvedValueOnce([{ baseTotal: BigInt(10), baseMastered: BigInt(3) }])
        .mockResolvedValueOnce([
          { date: thirtyDaysAgoPlus(15), newTotal: BigInt(1), newMastered: BigInt(1) },
        ]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.historicalProgress({ period: "30d" });

      // Day 0 to day 14: total=10, mastered=3
      const dayBefore = result.dailyCounts[10]; // some day before the delta
      expect(dayBefore.total).toBe(10);
      expect(dayBefore.mastered).toBe(3);
      // Day 15+: total=11, mastered=4
      const dayAfter = result.dailyCounts.find((d) => d.date === dateStr(thirtyDaysAgoPlus(15)));
      if (dayAfter) {
        expect(dayAfter.total).toBe(11);
        expect(dayAfter.mastered).toBe(4);
      }
    });

    test("parent can view child progress via family", async () => {
      setupParentFamilyAccess();
      mockDb.$queryRaw
        .mockResolvedValueOnce([{ baseTotal: BigInt(0), baseMastered: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const caller = createCaller(createCtx(parentSession));
      const result = await caller.profile.historicalProgress({
        studentId: "student-1",
        period: "30d",
      });

      expect(result.dailyCounts.length).toBeGreaterThan(0);
    });

    test("returns zeros when no data", async () => {
      mockDb.$queryRaw
        .mockResolvedValueOnce([{ baseTotal: BigInt(0), baseMastered: BigInt(0) }])
        .mockResolvedValueOnce([]);

      const caller = createCaller(createCtx(studentSession));
      const result = await caller.profile.historicalProgress({ period: "30d" });

      expect(result.dailyCounts.length).toBeGreaterThan(0);
      expect(result.dailyCounts[0].total).toBe(0);
      expect(result.dailyCounts[0].mastered).toBe(0);
    });
  });
});

// ─── Helpers ────────────────────────────────────

/** Get a Date N days after 30 days ago. */
function thirtyDaysAgoPlus(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - 30 + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format Date to YYYY-MM-DD (matching router's toDateString). */
function dateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
