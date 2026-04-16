/**
 * Unit: eval-run BullMQ handler (Sprint 16 US-058, Task 139).
 *
 * Asserts handler behavior:
 *   - skips when EvalRun is missing
 *   - skips when EvalRun status !== RUNNING (idempotency guard)
 *   - calls runEval with expected deps
 *   - marks EvalRun FAILED when runEval throws
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mocks declared BEFORE the import under test
const runEvalMock = vi.fn();
const findUniqueMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/infra/db", () => ({
  db: {
    evalRun: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
  },
}));

vi.mock("@/lib/domain/ai/eval/eval-runner", () => ({
  runEval: (...args: unknown[]) => runEvalMock(...args),
}));

vi.mock("@/lib/domain/ai/operations/registry", () => ({
  callAIOperation: vi.fn(),
}));

vi.mock("@/lib/infra/logger", () => ({
  createLogger: () => ({
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  }),
}));

import { handleEvalRun } from "@/worker/handlers/eval-run";
import type { Job } from "bullmq";
import type { EvalRunJobData } from "@/lib/infra/queue/types";

function mkJob(overrides?: Partial<EvalRunJobData>): Job<EvalRunJobData> {
  return {
    id: "job-1",
    data: {
      runId: "run-1",
      operations: ["SUBJECT_DETECT"],
      userId: "admin-1",
      locale: "zh-CN",
      ...overrides,
    },
  } as Job<EvalRunJobData>;
}

describe("handleEvalRun", () => {
  beforeEach(() => {
    runEvalMock.mockReset();
    findUniqueMock.mockReset();
    updateMock.mockReset();
  });

  test("skips when EvalRun is missing", async () => {
    findUniqueMock.mockResolvedValueOnce(null);
    await handleEvalRun(mkJob());
    expect(runEvalMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  test("skips when EvalRun already COMPLETED (idempotency)", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "run-1", status: "COMPLETED" });
    await handleEvalRun(mkJob());
    expect(runEvalMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  test("skips when EvalRun FAILED (admin must re-trigger)", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "run-1", status: "FAILED" });
    await handleEvalRun(mkJob());
    expect(runEvalMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  test("calls runEval when RUNNING", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "run-1", status: "RUNNING" });
    runEvalMock.mockResolvedValueOnce({
      runId: "run-1",
      status: "COMPLETED",
      operations: ["SUBJECT_DETECT"],
      totalCases: 1,
      passedCases: 1,
      failedCases: 0,
      erroredCases: 0,
      skippedCases: 0,
      passRate: 1,
      cases: [],
    });
    await handleEvalRun(mkJob());
    expect(runEvalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        adminId: "admin-1",
        operations: ["SUBJECT_DETECT"],
        locale: "zh-CN",
      }),
      expect.any(Object),
    );
    // EvalRunner itself finalizes the row in the happy path
    expect(updateMock).not.toHaveBeenCalled();
  });

  test("marks FAILED and rethrows when runEval crashes", async () => {
    findUniqueMock.mockResolvedValueOnce({ id: "run-1", status: "RUNNING" });
    runEvalMock.mockRejectedValueOnce(new Error("dataset load boom"));
    await expect(handleEvalRun(mkJob())).rejects.toThrow("dataset load boom");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: "FAILED",
          note: expect.stringContaining("dataset load boom"),
        }),
      }),
    );
  });
});
