/**
 * Unit Tests: completeDailyTaskInTx helper (Sprint 13, Task 119).
 *
 * Verifies owner check, optimistic-only-PENDING transition, pack counter
 * increment, and pack status transitions (IN_PROGRESS → COMPLETED).
 */
import { describe, test, expect, vi } from "vitest";
import {
  completeDailyTaskInTx,
  type DailyTaskTxClient,
} from "@/lib/domain/daily-task/complete";

interface MockTask {
  id: string;
  status: "PENDING" | "COMPLETED";
  pack: { id: string; studentId: string; totalTasks: number; completedTasks: number };
}

function createMockTx(opts: {
  task: MockTask | null;
  updateManyCount: number;
  packAfterIncrement?: { completedTasks: number; totalTasks: number };
}): { tx: DailyTaskTxClient; calls: { packStatus: string[] } } {
  const calls = { packStatus: [] as string[] };

  const tx = {
    dailyTask: {
      findUnique: vi.fn().mockResolvedValue(opts.task),
      updateMany: vi.fn().mockResolvedValue({ count: opts.updateManyCount }),
    },
    dailyTaskPack: {
      update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => {
        if (args.data?.completedTasks) {
          return Promise.resolve(opts.packAfterIncrement);
        }
        if (args.data?.status) {
          calls.packStatus.push(args.data.status as string);
          return Promise.resolve({});
        }
        return Promise.resolve({});
      }),
    },
  } as unknown as DailyTaskTxClient;

  return { tx, calls };
}

describe("completeDailyTaskInTx", () => {
  test("returns notFound when task does not exist", async () => {
    const { tx } = createMockTx({ task: null, updateManyCount: 0 });
    const result = await completeDailyTaskInTx(tx, {
      taskId: "missing",
      expectedStudentId: "s1",
    });
    expect(result.notFound).toBe(true);
  });

  test("returns ownerMismatch when studentId differs", async () => {
    const { tx } = createMockTx({
      task: {
        id: "t1",
        status: "PENDING",
        pack: { id: "p1", studentId: "OTHER", totalTasks: 3, completedTasks: 0 },
      },
      updateManyCount: 1,
    });
    const result = await completeDailyTaskInTx(tx, {
      taskId: "t1",
      expectedStudentId: "s1",
    });
    expect(result.ownerMismatch).toBe(true);
  });

  test("alreadyCompleted when updateMany matches 0 rows", async () => {
    const { tx } = createMockTx({
      task: {
        id: "t1",
        status: "COMPLETED",
        pack: { id: "p1", studentId: "s1", totalTasks: 3, completedTasks: 1 },
      },
      updateManyCount: 0,
    });
    const result = await completeDailyTaskInTx(tx, {
      taskId: "t1",
      expectedStudentId: "s1",
    });
    expect(result.alreadyCompleted).toBe(true);
    expect(result.allDone).toBe(false);
  });

  test("transitions pack to IN_PROGRESS when not all tasks done", async () => {
    const { tx, calls } = createMockTx({
      task: {
        id: "t1",
        status: "PENDING",
        pack: { id: "p1", studentId: "s1", totalTasks: 3, completedTasks: 0 },
      },
      updateManyCount: 1,
      packAfterIncrement: { completedTasks: 1, totalTasks: 3 },
    });
    const result = await completeDailyTaskInTx(tx, {
      taskId: "t1",
      expectedStudentId: "s1",
    });
    expect(result.alreadyCompleted).toBe(false);
    expect(result.allDone).toBe(false);
    expect(calls.packStatus).toEqual(["IN_PROGRESS"]);
  });

  test("transitions pack to COMPLETED when last task completes", async () => {
    const { tx, calls } = createMockTx({
      task: {
        id: "t1",
        status: "PENDING",
        pack: { id: "p1", studentId: "s1", totalTasks: 2, completedTasks: 1 },
      },
      updateManyCount: 1,
      packAfterIncrement: { completedTasks: 2, totalTasks: 2 },
    });
    const result = await completeDailyTaskInTx(tx, {
      taskId: "t1",
      expectedStudentId: "s1",
    });
    expect(result.allDone).toBe(true);
    expect(calls.packStatus).toEqual(["COMPLETED"]);
  });
});
