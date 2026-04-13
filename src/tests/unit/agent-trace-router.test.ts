/**
 * Unit Tests: Agent Trace Router
 * Tests list/detail/stats/latestForQuestion/latestForKnowledgePoint with mock DB.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db", () => ({
  db: {
    agentTrace: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    familyMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    // Stubs needed for appRouter resolution
    masteryState: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), groupBy: vi.fn(), count: vi.fn().mockResolvedValue(0), updateMany: vi.fn() },
    reviewSchedule: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn(), upsert: vi.fn() },
    knowledgePoint: { findMany: vi.fn().mockResolvedValue([]) },
    interventionHistory: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn(), create: vi.fn() },
    errorQuestion: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn(),
  },
}));
vi.mock("@/lib/infra/redis", () => ({
  redis: {
    zremrangebyscore: vi.fn(), zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn(), expire: vi.fn(), zrange: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("@/lib/infra/queue", () => ({
  enqueueRecognition: vi.fn(), enqueueCorrectionPhotos: vi.fn(),
  enqueueHelpGeneration: vi.fn(), enqueueQuestionUnderstanding: vi.fn(),
  enqueueDiagnosis: vi.fn(),
}));

import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { db } from "@/lib/infra/db";

const mockDb = db as unknown as {
  agentTrace: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  interventionHistory: { findFirst: ReturnType<typeof vi.fn> };
  familyMember: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
};

const createCaller = createCallerFactory(appRouter);

const adminSession = { userId: "admin-1", role: "ADMIN", grade: null, locale: "zh" };
const studentSession = { userId: "student-1", role: "STUDENT", grade: null, locale: "zh" };
const parentSession = { userId: "parent-1", role: "PARENT", grade: null, locale: "zh" };

function createCtx(session: Record<string, unknown>) {
  const pino = require("pino");
  return { db: mockDb as never, session: session as never, requestId: "test", log: pino({ level: "silent" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.agentTrace.findMany.mockResolvedValue([]);
  mockDb.agentTrace.count.mockResolvedValue(0);
});

// ── list ──

describe("agentTrace.list", () => {
  test("admin can list traces", async () => {
    const traces = [
      { id: "t-1", agentName: "diagnosis", status: "COMPLETED", user: { id: "u-1", nickname: "Alice", username: "alice" } },
    ];
    mockDb.agentTrace.findMany.mockResolvedValue(traces);
    mockDb.agentTrace.count.mockResolvedValue(1);

    const caller = createCaller(createCtx(adminSession));
    const result = await caller.agentTrace.list({});

    expect(result.traces).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  test("non-admin denied", async () => {
    const caller = createCaller(createCtx(studentSession));
    await expect(caller.agentTrace.list({})).rejects.toThrow("FORBIDDEN");
  });

  test("supports filters", async () => {
    mockDb.agentTrace.findMany.mockResolvedValue([]);
    mockDb.agentTrace.count.mockResolvedValue(0);

    const caller = createCaller(createCtx(adminSession));
    await caller.agentTrace.list({ agentName: "diagnosis", status: "FAILED", page: 2 });

    const findCall = mockDb.agentTrace.findMany.mock.calls[0][0];
    expect(findCall.where.agentName).toBe("diagnosis");
    expect(findCall.where.status).toBe("FAILED");
    expect(findCall.skip).toBe(20); // page 2, limit 20
  });
});

// ── detail ──

describe("agentTrace.detail", () => {
  test("returns trace with steps", async () => {
    mockDb.agentTrace.findUnique.mockResolvedValue({
      id: "t-1",
      agentName: "diagnosis",
      status: "COMPLETED",
      user: { id: "u-1", nickname: "Alice", username: "alice" },
      steps: [
        { id: "s-1", stepNo: 1, skillName: "diagnose-error", status: "SUCCESS" },
      ],
    });

    const caller = createCaller(createCtx(adminSession));
    const result = await caller.agentTrace.detail({ traceId: "t-1" });

    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].skillName).toBe("diagnose-error");
  });

  test("throws NOT_FOUND", async () => {
    mockDb.agentTrace.findUnique.mockResolvedValue(null);

    const caller = createCaller(createCtx(adminSession));
    await expect(caller.agentTrace.detail({ traceId: "nope" })).rejects.toThrow("Trace not found");
  });
});

// ── stats ──

describe("agentTrace.stats", () => {
  test("aggregates by agent", async () => {
    mockDb.agentTrace.findMany.mockResolvedValue([
      { agentName: "diagnosis", status: "COMPLETED", totalDurationMs: 5000, totalInputTokens: 1000, totalOutputTokens: 500 },
      { agentName: "diagnosis", status: "FAILED", totalDurationMs: 3000, totalInputTokens: 800, totalOutputTokens: 200 },
      { agentName: "question-understanding", status: "COMPLETED", totalDurationMs: 2000, totalInputTokens: 500, totalOutputTokens: 300 },
    ]);

    const caller = createCaller(createCtx(adminSession));
    const result = await caller.agentTrace.stats();

    expect(result.totalTraces).toBe(3);
    const diag = result.byAgent.find((a: { agentName: string }) => a.agentName === "diagnosis");
    expect(diag?.totalCalls).toBe(2);
    expect(diag?.successRate).toBe(50);
    expect(diag?.avgDurationMs).toBe(4000);
  });
});

// ── latestForQuestion ──

describe("agentTrace.latestForQuestion", () => {
  test("student views own trace", async () => {
    const diagTime = new Date();
    mockDb.interventionHistory.findFirst.mockResolvedValue({
      createdAt: diagTime,
    });
    mockDb.agentTrace.findFirst.mockResolvedValue({
      id: "t-1",
      status: "COMPLETED",
      summary: "Error pattern: CONCEPT_CONFUSION.",
      totalSteps: 3,
      totalDurationMs: 5000,
      createdAt: diagTime,
    });

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.agentTrace.latestForQuestion({
      errorQuestionId: "eq-1",
    });

    expect(result?.status).toBe("COMPLETED");
    expect(result?.summary).toContain("CONCEPT_CONFUSION");
  });

  test("parent views child trace via family", async () => {
    mockDb.familyMember.findMany.mockResolvedValue([{ familyId: "fam-1" }]);
    mockDb.familyMember.findFirst.mockResolvedValue({ userId: "student-1", familyId: "fam-1" });
    mockDb.interventionHistory.findFirst.mockResolvedValue({ createdAt: new Date() });
    mockDb.agentTrace.findFirst.mockResolvedValue({
      id: "t-1", status: "COMPLETED", summary: "OK", totalSteps: 2, totalDurationMs: 3000, createdAt: new Date(),
    });

    const caller = createCaller(createCtx(parentSession));
    const result = await caller.agentTrace.latestForQuestion({
      studentId: "student-1",
      errorQuestionId: "eq-1",
    });

    expect(result?.status).toBe("COMPLETED");
  });

  test("returns null when no intervention found", async () => {
    mockDb.interventionHistory.findFirst.mockResolvedValue(null);

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.agentTrace.latestForQuestion({
      errorQuestionId: "eq-999",
    });

    expect(result).toBeNull();
  });
});

// ── latestForKnowledgePoint ──

describe("agentTrace.latestForKnowledgePoint", () => {
  test("returns latest diagnosis trace", async () => {
    mockDb.agentTrace.findMany.mockResolvedValue([
      { id: "t-2", status: "COMPLETED", summary: "Found 2 weak KPs", totalSteps: 4, totalDurationMs: 8000, createdAt: new Date() },
    ]);

    const caller = createCaller(createCtx(studentSession));
    const result = await caller.agentTrace.latestForKnowledgePoint({
      knowledgePointId: "kp-1",
    });

    expect(result?.id).toBe("t-2");
  });
});
