/**
 * Unit: EvalRunner pipeline (Sprint 16 US-058).
 *
 * Uses injected stub datasets + fake callAIOperation to assert:
 *   - SKIPPED path when dataset has unavailableReason
 *   - PASS via exact-match only
 *   - FAIL via exact-match mismatch (short-circuits, no judge call)
 *   - PASS/FAIL via EVAL_JUDGE score
 *   - ERROR when harness returns success=false or throws
 *   - EvalRun final aggregates (passRate denominator excludes SKIPPED)
 */
import { describe, test, expect, vi } from "vitest";
import type { AIHarnessResult } from "@/lib/domain/ai/harness/types";
import { runEval } from "@/lib/domain/ai/eval/eval-runner";
import type { EvalDataset } from "@/lib/domain/ai/eval/types";
import type { AIOperationType } from "@prisma/client";

interface FakeDbCall {
  runId?: string;
  update?: unknown;
  cases?: unknown[];
}

function makeFakeDb() {
  const calls: FakeDbCall = {};
  const db = {
    evalCase: {
      createMany: vi.fn(async ({ data }: { data: unknown[] }) => {
        calls.cases = data;
        return { count: data.length };
      }),
    },
    evalRun: {
      update: vi.fn(async (args: { where: { id: string }; data: unknown }) => {
        calls.runId = args.where.id;
        calls.update = args.data;
        return {};
      }),
    },
  };
  return { db, calls };
}

describe("runEval", () => {
  test("SKIPPED: dataset with unavailableReason", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("WEAKNESS_PROFILE", {
      operation: "WEAKNESS_PROFILE",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: [],
      cases: [],
      unavailableReason: "by design",
    });
    const { db, calls } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-1",
        adminId: "admin-1",
        operations: ["WEAKNESS_PROFILE"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: vi.fn(),
        loadDatasets: async () => datasets,
      },
    );
    expect(result.skippedCases).toBe(1);
    expect(result.passedCases).toBe(0);
    expect(result.passRate).toBeNull();
    expect(calls.cases).toHaveLength(1);
    expect((calls.cases as Array<{ status: string }>)[0].status).toBe("SKIPPED");
  });

  test("PASS via exact-match only, judge NOT called", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("SUBJECT_DETECT", {
      operation: "SUBJECT_DETECT",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: [],
      cases: [
        {
          id: "sd-01",
          input: { questionContent: "1+1?" },
          expected: { subject: "MATH" },
        },
      ],
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      .mockResolvedValueOnce({ success: true, data: { subject: "MATH", confidence: 0.9 } });
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-2",
        adminId: "admin-1",
        operations: ["SUBJECT_DETECT"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    expect(result.passedCases).toBe(1);
    expect(result.passRate).toBe(1);
    expect(callAI).toHaveBeenCalledTimes(1); // only the op, not EVAL_JUDGE
  });

  test("FAIL via exact-match mismatch short-circuits (no judge call)", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("SUBJECT_DETECT", {
      operation: "SUBJECT_DETECT",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: ["reasoning"], // would be called if exact matched
      cases: [
        {
          id: "sd-02",
          input: { questionContent: "q" },
          expected: { subject: "MATH", reasoning: "arithmetic" },
        },
      ],
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      .mockResolvedValueOnce({ success: true, data: { subject: "CHINESE", reasoning: "x" } });
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-3",
        adminId: "admin-1",
        operations: ["SUBJECT_DETECT"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    expect(result.failedCases).toBe(1);
    expect(result.passRate).toBe(0);
    expect(callAI).toHaveBeenCalledTimes(1); // ONLY the op, no judge
  });

  test("PASS via EVAL_JUDGE score=4 (judgedFields only)", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("DIAGNOSE_ERROR", {
      operation: "DIAGNOSE_ERROR",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: ["errorDescription"],
      cases: [
        {
          id: "de-01",
          input: { question: "q" },
          expected: { errorDescription: "expected text" },
        },
      ],
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      // op call
      .mockResolvedValueOnce({ success: true, data: { errorDescription: "similar text" } })
      // judge call
      .mockResolvedValueOnce({
        success: true,
        data: { score: 4, passed: true, reasoning: "Close enough on meaning." },
      });
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-4",
        adminId: "admin-1",
        operations: ["DIAGNOSE_ERROR"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    expect(result.passedCases).toBe(1);
    expect(callAI).toHaveBeenCalledTimes(2);
    expect(callAI).toHaveBeenLastCalledWith(
      "EVAL_JUDGE",
      expect.objectContaining({ operation: "DIAGNOSE_ERROR" }),
      expect.anything(),
    );
  });

  test("FAIL via EVAL_JUDGE score=2", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("DIAGNOSE_ERROR", {
      operation: "DIAGNOSE_ERROR",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: ["errorDescription"],
      cases: [
        {
          id: "de-02",
          input: {},
          expected: { errorDescription: "expected" },
        },
      ],
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      .mockResolvedValueOnce({ success: true, data: { errorDescription: "wrong" } })
      .mockResolvedValueOnce({
        success: true,
        data: { score: 2, passed: false, reasoning: "Meaning diverges significantly." },
      });
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-5",
        adminId: "admin-1",
        operations: ["DIAGNOSE_ERROR"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    expect(result.failedCases).toBe(1);
    expect(result.passRate).toBe(0);
  });

  test("ERROR when op throws", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("SUBJECT_DETECT", {
      operation: "SUBJECT_DETECT",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: [],
      cases: [
        { id: "sd-err", input: {}, expected: { subject: "MATH" } },
      ],
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      .mockRejectedValueOnce(new Error("provider boom"));
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-6",
        adminId: "admin-1",
        operations: ["SUBJECT_DETECT"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    expect(result.erroredCases).toBe(1);
    // ERROR excluded from passRate calculation? No — ERROR counts toward denominator
    // (dataset case existed, just failed to run). passRate = 0 / 1 = 0.
    expect(result.passRate).toBe(0);
  });

  test("OCR imageFiles → base64 data URI preprocessing", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("OCR_RECOGNIZE", {
      operation: "OCR_RECOGNIZE",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: [],
      cases: [
        {
          id: "ocr-test",
          input: {
            imageFiles: ["math-g2-01.jpg"],
            hasExif: false,
          },
          expected: { subject: "MATH" },
        },
      ],
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      .mockResolvedValueOnce({ success: true, data: { subject: "MATH" } });
    const { db } = makeFakeDb();
    await runEval(
      {
        runId: "run-ocr",
        adminId: "admin-1",
        operations: ["OCR_RECOGNIZE"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    const passedArg = callAI.mock.calls[0]![1] as {
      imageFiles?: unknown;
      imageUrls?: string[];
      hasExif?: boolean;
    };
    // imageFiles is stripped; imageUrls is base64 data URI
    expect(passedArg.imageFiles).toBeUndefined();
    expect(passedArg.imageUrls).toBeDefined();
    expect(passedArg.imageUrls![0]).toMatch(/^data:image\/jpeg;base64,\/9j\//);
    // Non-fixture fields passed through
    expect(passedArg.hasExif).toBe(false);
  });

  test("OCR missing fixture file → throws with path in error", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("OCR_RECOGNIZE", {
      operation: "OCR_RECOGNIZE",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: [],
      cases: [
        {
          id: "ocr-missing",
          input: { imageFiles: ["does-not-exist.jpg"] },
          expected: {},
        },
      ],
    });
    const callAI = vi.fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>();
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-miss",
        adminId: "admin-1",
        operations: ["OCR_RECOGNIZE"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    // Missing fixture bubbles up as ERROR for that case (not a crash)
    expect(result.erroredCases).toBe(1);
    expect(callAI).not.toHaveBeenCalled();
  });

  test("passRate excludes SKIPPED from denominator; mixed aggregates", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("SUBJECT_DETECT", {
      operation: "SUBJECT_DETECT",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: [],
      cases: [
        { id: "sd-ok", input: {}, expected: { subject: "MATH" } },
        { id: "sd-fail", input: {}, expected: { subject: "ENGLISH" } },
      ],
    });
    datasets.set("WEAKNESS_PROFILE", {
      operation: "WEAKNESS_PROFILE",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: [],
      cases: [],
      unavailableReason: "stub",
    });
    const callAI = vi
      .fn<(op: string, data: Record<string, unknown>) => Promise<AIHarnessResult<unknown>>>()
      .mockResolvedValueOnce({ success: true, data: { subject: "MATH" } })
      .mockResolvedValueOnce({ success: true, data: { subject: "MATH" } }); // fails — expected was ENGLISH
    const { db } = makeFakeDb();
    const result = await runEval(
      {
        runId: "run-7",
        adminId: "admin-1",
        operations: ["SUBJECT_DETECT", "WEAKNESS_PROFILE"],
        locale: "zh-CN",
      },
      {
        db: db as unknown as Parameters<typeof runEval>[1]["db"],
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );
    expect(result.totalCases).toBe(3);
    expect(result.passedCases).toBe(1);
    expect(result.failedCases).toBe(1);
    expect(result.skippedCases).toBe(1);
    // Evaluable = total - skipped = 2; passRate = 1/2 = 0.5
    expect(result.passRate).toBe(0.5);
  });
});
