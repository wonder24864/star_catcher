/**
 * Unit tests: task-runner lifecycle (ADR-013).
 *
 * Verifies that createTaskRun / updateTaskStep / completeTask / failTask
 * hit the right Prisma calls AND publish a matching TaskProgressEvent
 * to the per-user Redis channel.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";

type FakeTaskRun = {
  id: string;
  userId: string;
  studentId: string | null;
  type: string;
  key: string;
  bullJobId: string | null;
  status: string;
  step: string | null;
  progress: number | null;
  resultRef: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

let rows: FakeTaskRun[] = [];
let seq = 0;
const published: Array<{ channel: string; event: Record<string, unknown> }> = [];

vi.mock("@/lib/infra/db", () => ({
  db: {
    taskRun: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const { userId, key, status } = where as {
          userId: string;
          key: string;
          status?: { in: string[] };
        };
        return (
          rows.find(
            (r) =>
              r.userId === userId &&
              r.key === key &&
              (status ? status.in.includes(r.status) : true),
          ) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const { userId, status } = where as {
          userId: string;
          status: { in: string[] };
        };
        return rows.filter(
          (r) => r.userId === userId && status.in.includes(r.status),
        );
      }),
      create: vi.fn(async ({ data }: { data: Partial<FakeTaskRun> }) => {
        const row: FakeTaskRun = {
          id: `task_${++seq}`,
          userId: data.userId!,
          studentId: data.studentId ?? null,
          type: data.type!,
          key: data.key!,
          bullJobId: data.bullJobId ?? null,
          status: (data.status as string) ?? "QUEUED",
          step: data.step ?? null,
          progress: null,
          resultRef: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        };
        rows.push(row);
        return row;
      }),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Partial<FakeTaskRun>;
        }) => {
          const r = rows.find((x) => x.id === where.id);
          if (!r) throw new Error("not found");
          Object.assign(r, data, { updatedAt: new Date() });
          return r;
        },
      ),
    },
  },
}));

vi.mock("@/lib/infra/events", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/infra/events")>(
      "@/lib/infra/events",
    );
  return {
    ...actual,
    publishTaskEvent: vi.fn(
      async (userId: string, event: Record<string, unknown>) => {
        published.push({ channel: `task:user:${userId}`, event });
      },
    ),
  };
});

// Import AFTER mocks so the spies are wired
const {
  createTaskRun,
  updateTaskStep,
  completeTask,
  failTask,
  getActiveTasksForUser,
} = await import("@/lib/task-runner");

// Grab the mocked db for passing to createTaskRun (which now requires it)
const { db: fakeDb } = await import("@/lib/infra/db");

beforeEach(() => {
  rows = [];
  seq = 0;
  published.length = 0;
});

describe("createTaskRun", () => {
  test("creates a QUEUED row and publishes the initial event", async () => {
    const { task, isNew } = await createTaskRun(fakeDb, {
      type: "OCR",
      key: "ocr:sess1",
      userId: "user1",
    });

    expect(task.id).toBe("task_1");
    expect(task.status).toBe("QUEUED");
    expect(isNew).toBe(true);
    expect(rows).toHaveLength(1);
    expect(published).toHaveLength(1);
    expect(published[0].channel).toBe("task:user:user1");
    expect(published[0].event).toMatchObject({
      taskId: "task_1",
      type: "OCR",
      key: "ocr:sess1",
      status: "QUEUED",
    });
  });

  test("is idempotent by (userId, key) while active — isNew flags the collapse", async () => {
    const first = await createTaskRun(fakeDb, {
      type: "OCR",
      key: "ocr:sess1",
      userId: "user1",
    });
    const second = await createTaskRun(fakeDb, {
      type: "OCR",
      key: "ocr:sess1",
      userId: "user1",
    });
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false); // caller MUST skip enqueue now
    expect(second.task.id).toBe(first.task.id);
    expect(rows).toHaveLength(1);
    // Only the first create publishes; the re-use path is silent.
    expect(published).toHaveLength(1);
  });

  test("a different user with the same key gets its own row", async () => {
    await createTaskRun(fakeDb, { type: "OCR", key: "ocr:s", userId: "u1" });
    await createTaskRun(fakeDb, { type: "OCR", key: "ocr:s", userId: "u2" });
    expect(rows).toHaveLength(2);
  });
});

describe("updateTaskStep", () => {
  test("transitions status to RUNNING and records step + progress", async () => {
    const { task } = await createTaskRun(fakeDb, {
      type: "OCR",
      key: "k",
      userId: "u",
    });
    published.length = 0;

    await updateTaskStep(task.id, {
      step: "task.step.ocr.recognizing",
      progress: 40,
    });

    expect(rows[0].status).toBe("RUNNING");
    expect(rows[0].step).toBe("task.step.ocr.recognizing");
    expect(rows[0].progress).toBe(40);
    expect(published[0].event.status).toBe("RUNNING");
    expect(published[0].event.progress).toBe(40);
  });
});

describe("completeTask", () => {
  test("sets COMPLETED + completedAt + resultRef and publishes", async () => {
    const { task } = await createTaskRun(fakeDb, {
      type: "HELP",
      key: "help:k",
      userId: "u",
    });
    await completeTask(task.id, {
      resultRef: { route: "/check/abc/results", payload: { level: 1 } },
    });

    expect(rows[0].status).toBe("COMPLETED");
    expect(rows[0].completedAt).toBeInstanceOf(Date);
    expect(rows[0].progress).toBe(100);
    expect(rows[0].resultRef).toEqual({
      route: "/check/abc/results",
      payload: { level: 1 },
    });
    const last = published[published.length - 1];
    expect(last.event.status).toBe("COMPLETED");
  });
});

describe("failTask", () => {
  test("records error and publishes FAILED", async () => {
    const { task } = await createTaskRun(fakeDb, {
      type: "EVAL",
      key: "eval:all",
      userId: "u",
    });
    await failTask(task.id, {
      errorCode: "EVAL_CRASHED",
      errorMessage: "boom",
    });

    expect(rows[0].status).toBe("FAILED");
    expect(rows[0].errorCode).toBe("EVAL_CRASHED");
    expect(rows[0].errorMessage).toBe("boom");
    const last = published[published.length - 1];
    expect(last.event.status).toBe("FAILED");
    expect(last.event.errorMessage).toBe("boom");
  });
});

describe("getActiveTasksForUser", () => {
  test("returns only QUEUED/RUNNING rows for the user", async () => {
    const a = await createTaskRun(fakeDb, { type: "OCR", key: "a", userId: "u" });
    await createTaskRun(fakeDb, { type: "HELP", key: "b", userId: "u" });
    await createTaskRun(fakeDb, { type: "EVAL", key: "c", userId: "other" });

    // Mark a as completed
    await completeTask(a.task.id, {});

    const active = await getActiveTasksForUser("u");
    expect(active).toHaveLength(1);
    expect(active[0].key).toBe("b");
  });
});
