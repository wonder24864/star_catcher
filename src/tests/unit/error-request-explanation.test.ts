/**
 * Unit tests for error.requestExplanation mutation:
 *  - STUDENT / non-family parent → FORBIDDEN (RBAC)
 *  - Already cached → short-circuit, no TaskRun, no enqueue (P2-10)
 *  - First-time: creates TaskRun + enqueues + attaches bullJobId
 *  - Second call with active TaskRun → idempotent, no duplicate enqueue
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

const enqueueMock = vi.fn();
vi.mock("@/lib/infra/queue", () => ({
  enqueueGenerateExplanation: (data: unknown) => enqueueMock(data),
}));

type FakeEq = {
  id: string;
  studentId: string;
  deletedAt: Date | null;
  explanation: unknown;
};
type FakeTask = {
  id: string;
  userId: string;
  studentId: string | null;
  type: string;
  key: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  bullJobId: string | null;
  step: string | null;
  progress: number | null;
  resultRef: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};
type FakeFM = { userId: string; familyId: string };

let errorQuestions: FakeEq[] = [];
let tasks: FakeTask[] = [];
let familyMembers: FakeFM[] = [];
let taskSeq = 0;

function buildDb() {
  return {
    errorQuestion: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        errorQuestions.find((e) => e.id === where.id) ?? null,
      ),
    },
    familyMember: {
      findMany: vi.fn(
        async ({ where, select }: { where: { userId: string }; select?: unknown }) => {
          const rows = familyMembers.filter((fm) => fm.userId === where.userId);
          return select ? rows.map((r) => ({ familyId: r.familyId })) : rows;
        },
      ),
      findFirst: vi.fn(
        async ({ where }: { where: { userId: string; familyId: { in: string[] } } }) => {
          return (
            familyMembers.find(
              (fm) =>
                fm.userId === where.userId && where.familyId.in.includes(fm.familyId),
            ) ?? null
          );
        },
      ),
    },
    taskRun: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string; key: string; status?: { in: string[] } };
        }) =>
          tasks.find(
            (t) =>
              t.userId === where.userId &&
              t.key === where.key &&
              (!where.status || where.status.in.includes(t.status)),
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Partial<FakeTask> }) => {
        const now = new Date();
        const row: FakeTask = {
          id: `task-${++taskSeq}`,
          userId: data.userId!,
          studentId: data.studentId ?? null,
          type: (data.type as string) ?? "EXPLANATION",
          key: data.key!,
          status: "QUEUED",
          bullJobId: data.bullJobId ?? null,
          step: data.step ?? null,
          progress: null,
          resultRef: null,
          errorCode: null,
          errorMessage: null,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        tasks.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeTask>;
        }) => {
          const t = tasks.find((x) => x.id === where.id);
          if (!t) throw new Error("task not found");
          Object.assign(t, data, { updatedAt: new Date() });
          return t;
        },
      ),
    },
  };
}

vi.mock("@/lib/infra/events", () => ({
  publishTaskEvent: vi.fn(async () => {}),
  userTaskChannel: (uid: string) => `task:user:${uid}`,
}));

import { createCallerFactory } from "@/server/trpc";

// Import appRouter lazily so the queue/events mocks are applied
const { appRouter } = await import("@/server/routers/_app");
const createCaller = createCallerFactory(appRouter);

function makeCtx(session: {
  userId: string;
  role: "STUDENT" | "PARENT" | "ADMIN";
}) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    db: buildDb() as any,
    session: { ...session, grade: null, locale: "zh" },
    requestId: "test",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: { child: () => ({ info: () => {}, warn: () => {}, error: () => {} }) } as any,
  };
}

beforeEach(() => {
  errorQuestions = [];
  tasks = [];
  familyMembers = [
    { userId: "parent-1", familyId: "fam-1" },
    { userId: "student-1", familyId: "fam-1" },
  ];
  taskSeq = 0;
  enqueueMock.mockReset();
  enqueueMock.mockResolvedValue("bull-job-id");
});

describe("error.requestExplanation — RBAC", () => {
  test("STUDENT role is forbidden regardless of ownership", async () => {
    errorQuestions.push({
      id: "eq-1",
      studentId: "student-1",
      deletedAt: null,
      explanation: null,
    });
    const ctx = makeCtx({ userId: "student-1", role: "STUDENT" });
    const caller = createCaller(ctx);
    await expect(
      caller.error.requestExplanation({ errorQuestionId: "eq-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("non-family PARENT is forbidden", async () => {
    errorQuestions.push({
      id: "eq-1",
      studentId: "student-X", // not in fam-1
      deletedAt: null,
      explanation: null,
    });
    const ctx = makeCtx({ userId: "parent-1", role: "PARENT" });
    const caller = createCaller(ctx);
    await expect(
      caller.error.requestExplanation({ errorQuestionId: "eq-1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("error.requestExplanation — happy paths", () => {
  test("first call creates TaskRun + enqueues + attaches bullJobId", async () => {
    errorQuestions.push({
      id: "eq-1",
      studentId: "student-1",
      deletedAt: null,
      explanation: null,
    });
    const ctx = makeCtx({ userId: "parent-1", role: "PARENT" });
    const caller = createCaller(ctx);

    const result = await caller.error.requestExplanation({
      errorQuestionId: "eq-1",
    });

    expect(result.cached).toBe(false);
    expect(result.taskId).toBe("task-1");
    expect(result.taskKey).toBe("explanation:eq-1");
    expect(enqueueMock).toHaveBeenCalledTimes(1);
    expect(tasks[0].bullJobId).toBe("bull-job-id"); // attachBullJobId ran
  });

  test("cached explanation → short-circuit, no TaskRun, no enqueue (P2-10)", async () => {
    errorQuestions.push({
      id: "eq-1",
      studentId: "student-1",
      deletedAt: null,
      explanation: { format: "static", title: "cached", steps: [] },
    });
    const ctx = makeCtx({ userId: "parent-1", role: "PARENT" });
    const caller = createCaller(ctx);

    const result = await caller.error.requestExplanation({
      errorQuestionId: "eq-1",
    });

    expect(result.cached).toBe(true);
    expect(result.taskId).toBeNull();
    expect(tasks).toHaveLength(0);
    expect(enqueueMock).not.toHaveBeenCalled();
  });

  test("second call with active TaskRun collapses to same taskId, no extra enqueue", async () => {
    errorQuestions.push({
      id: "eq-1",
      studentId: "student-1",
      deletedAt: null,
      explanation: null,
    });
    const ctx = makeCtx({ userId: "parent-1", role: "PARENT" });
    const caller = createCaller(ctx);

    const first = await caller.error.requestExplanation({
      errorQuestionId: "eq-1",
    });
    const second = await caller.error.requestExplanation({
      errorQuestionId: "eq-1",
    });

    expect(second.taskId).toBe(first.taskId);
    expect(enqueueMock).toHaveBeenCalledTimes(1); // only first call enqueued
  });
});

describe("error.requestExplanation — not found", () => {
  test("unknown errorQuestionId → NOT_FOUND", async () => {
    const ctx = makeCtx({ userId: "parent-1", role: "PARENT" });
    const caller = createCaller(ctx);
    await expect(
      caller.error.requestExplanation({ errorQuestionId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("soft-deleted row → NOT_FOUND", async () => {
    errorQuestions.push({
      id: "eq-1",
      studentId: "student-1",
      deletedAt: new Date(),
      explanation: null,
    });
    const ctx = makeCtx({ userId: "parent-1", role: "PARENT" });
    const caller = createCaller(ctx);
    await expect(
      caller.error.requestExplanation({ errorQuestionId: "eq-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
