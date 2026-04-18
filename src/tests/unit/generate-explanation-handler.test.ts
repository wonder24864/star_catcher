/**
 * Unit tests for handleGenerateExplanation — cache hit / success / failure
 * paths, plus TaskRun lifecycle signals and kpName fallback (P2-5).
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import type { Job } from "bullmq";
import type { GenerateExplanationJobData } from "@/lib/infra/queue/types";

type FakeEq = {
  id: string;
  content: string;
  correctAnswer: string | null;
  studentAnswer: string | null;
  subject: string;
  grade: string | null;
  aiKnowledgePoint: string | null;
  explanation: unknown;
};

let eqRow: FakeEq | null = null;
let updatedData: Record<string, unknown> | null = null;
const taskEvents: Array<{ action: string; args: unknown[] }> = [];

vi.mock("@/lib/infra/db", () => ({
  db: {
    errorQuestion: {
      findFirst: vi.fn(async () => eqRow),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updatedData = data;
        return { ...eqRow, ...data };
      }),
    },
  },
}));

vi.mock("@/lib/task-runner", () => ({
  updateTaskStep: vi.fn(async (...args: unknown[]) => {
    taskEvents.push({ action: "updateStep", args });
  }),
  completeTask: vi.fn(async (...args: unknown[]) => {
    taskEvents.push({ action: "complete", args });
  }),
  failTask: vi.fn(async (...args: unknown[]) => {
    taskEvents.push({ action: "fail", args });
  }),
}));

const generateMock = vi.fn();
vi.mock("@/lib/domain/ai/operations/generate-explanation", () => ({
  generateExplanation: (opts: unknown) => generateMock(opts),
}));

const { handleGenerateExplanation } = await import(
  "@/worker/handlers/generate-explanation"
);

function makeJob(
  overrides: Partial<GenerateExplanationJobData> = {},
): Job<GenerateExplanationJobData> {
  return {
    id: "job-1",
    data: {
      errorQuestionId: "eq-1",
      userId: "parent-1",
      studentId: "student-1",
      locale: "zh",
      taskId: "task-1",
      ...overrides,
    },
    attemptsMade: 0,
    opts: { attempts: 2 },
  } as unknown as Job<GenerateExplanationJobData>;
}

beforeEach(() => {
  eqRow = null;
  updatedData = null;
  taskEvents.length = 0;
  generateMock.mockReset();
});

describe("handleGenerateExplanation", () => {
  test("cache hit: already-stored explanation → no AI call, task completes", async () => {
    eqRow = {
      id: "eq-1",
      content: "2+2=?",
      correctAnswer: "4",
      studentAnswer: "5",
      subject: "MATH",
      grade: "PRIMARY_3",
      aiKnowledgePoint: "addition",
      explanation: { format: "static", title: "cached", steps: [] },
    };

    await handleGenerateExplanation(makeJob());

    expect(generateMock).not.toHaveBeenCalled();
    expect(updatedData).toBeNull(); // no DB write — already cached
    const complete = taskEvents.find((e) => e.action === "complete");
    expect(complete).toBeDefined();
    const payload = (complete!.args[1] as { resultRef?: { payload?: unknown } })
      .resultRef?.payload as { cached?: boolean };
    expect(payload?.cached).toBe(true);
  });

  test("success: calls AI, caches result, completes task with generated flag", async () => {
    eqRow = {
      id: "eq-1",
      content: "Q",
      correctAnswer: "A",
      studentAnswer: "B",
      subject: "MATH",
      grade: "PRIMARY_3",
      aiKnowledgePoint: "fractions",
      explanation: null,
    };
    const generated = {
      format: "static",
      title: "How to solve",
      steps: [{ content: "step 1" }],
    };
    generateMock.mockResolvedValue({ success: true, data: generated });

    await handleGenerateExplanation(makeJob());

    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(updatedData).toEqual({ explanation: generated });
    const complete = taskEvents.find((e) => e.action === "complete");
    expect(complete).toBeDefined();
    const stepEvents = taskEvents.filter((e) => e.action === "updateStep");
    expect(stepEvents.length).toBeGreaterThanOrEqual(2); // loading + generating + saving
  });

  test("kpName fallback (P2-5): empty aiKnowledgePoint → subject+grade descriptor", async () => {
    eqRow = {
      id: "eq-1",
      content: "Q",
      correctAnswer: null,
      studentAnswer: null,
      subject: "MATH",
      grade: "PRIMARY_3",
      aiKnowledgePoint: null, // KG not populated for this error yet
      explanation: null,
    };
    generateMock.mockResolvedValue({
      success: true,
      data: { format: "static", title: "t", steps: [] },
    });

    await handleGenerateExplanation(makeJob());

    const callArg = generateMock.mock.calls[0][0] as { kpName: string };
    expect(callArg.kpName).toBe("MATH (PRIMARY_3)");
    expect(callArg.kpName).not.toBe("");
  });

  test("failure non-retryable: calls failTask and returns without throwing", async () => {
    eqRow = {
      id: "eq-1",
      content: "Q",
      correctAnswer: null,
      studentAnswer: null,
      subject: "MATH",
      grade: null,
      aiKnowledgePoint: "x",
      explanation: null,
    };
    generateMock.mockResolvedValue({
      success: false,
      error: { message: "rate limited", retryable: false },
    });

    await handleGenerateExplanation(makeJob());

    const fail = taskEvents.find((e) => e.action === "fail");
    expect(fail).toBeDefined();
    expect(updatedData).toBeNull(); // nothing cached
  });

  test("not found: throws on missing ErrorQuestion", async () => {
    eqRow = null;
    await expect(handleGenerateExplanation(makeJob())).rejects.toThrow(
      /ERROR_QUESTION_NOT_FOUND/,
    );
  });
});
