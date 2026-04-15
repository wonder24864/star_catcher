/**
 * Unit Tests: mastery-evaluation handler pure helpers.
 *
 * Covers:
 *   - extractResult: dual-source extraction (evaluate_mastery step output vs.
 *     finalResponse JSON), null-safety, invalid-field rejection
 *   - computeMasterySpeed: rolling correct rate from interventionHistory
 *
 * The handler's Agent/DB side-effects path is exercised by integration tests
 * (end-to-end-loop); pure parser logic lives here because it's the piece
 * most sensitive to prompt drift.
 *
 * See: docs/user-stories/mastery-evaluation.md (US-053)
 */
import { describe, test, expect } from "vitest";
import {
  extractResult,
  computeMasterySpeed,
} from "@/worker/handlers/mastery-evaluation";
import type {
  AgentRunResult,
  AgentStep,
} from "@/lib/domain/agent/types";

function makeStep(partial: Partial<AgentStep>): AgentStep {
  return {
    stepNo: 1,
    skillName: "evaluate_mastery",
    input: {},
    output: undefined,
    tokensUsed: { inputTokens: 0, outputTokens: 0 },
    durationMs: 0,
    status: "SUCCESS",
    errorMessage: undefined,
    ...partial,
  } as AgentStep;
}

function makeRun(partial: Partial<AgentRunResult>): AgentRunResult {
  return {
    steps: [],
    totalSteps: 0,
    totalTokens: { inputTokens: 0, outputTokens: 0 },
    totalDurationMs: 0,
    status: "COMPLETED",
    terminationReason: "COMPLETED",
    finalResponse: undefined,
    ...partial,
  } as AgentRunResult;
}

describe("extractResult", () => {
  test("prefers evaluate_mastery step output over finalResponse", () => {
    const run = makeRun({
      steps: [
        makeStep({
          skillName: "evaluate_mastery",
          status: "SUCCESS",
          output: {
            recommendedTransition: {
              from: "REVIEWING",
              to: "MASTERED",
              reason: "from step",
            },
            sm2Adjustment: null,
            summary: "step summary",
          },
        }),
      ],
      finalResponse: JSON.stringify({
        recommendedTransition: {
          from: "REVIEWING",
          to: "REGRESSED",
          reason: "from final",
        },
        sm2Adjustment: null,
        summary: "final summary",
      }),
    });
    const result = extractResult(run);
    expect(result?.recommendedTransition?.reason).toBe("from step");
    expect(result?.summary).toBe("step summary");
  });

  test("falls back to finalResponse JSON when step output missing", () => {
    const run = makeRun({
      steps: [],
      finalResponse: JSON.stringify({
        recommendedTransition: {
          from: "REVIEWING",
          to: "MASTERED",
          reason: "fallback",
        },
        sm2Adjustment: {
          errorType: "concept",
          intervalMultiplier: 0.6,
        },
        summary: "ok",
      }),
    });
    const result = extractResult(run);
    expect(result?.recommendedTransition?.to).toBe("MASTERED");
    expect(result?.sm2Adjustment?.errorType).toBe("concept");
  });

  test("null transition passes through", () => {
    const run = makeRun({
      steps: [
        makeStep({
          skillName: "evaluate_mastery",
          status: "SUCCESS",
          output: {
            recommendedTransition: null,
            sm2Adjustment: null,
            summary: "no change needed",
          },
        }),
      ],
    });
    const result = extractResult(run);
    expect(result?.recommendedTransition).toBeNull();
    expect(result?.sm2Adjustment).toBeNull();
    expect(result?.summary).toBe("no change needed");
  });

  test("rejects invalid status enum in transition", () => {
    const run = makeRun({
      steps: [
        makeStep({
          skillName: "evaluate_mastery",
          status: "SUCCESS",
          output: {
            recommendedTransition: {
              from: "INVALID_STATUS",
              to: "MASTERED",
              reason: "nope",
            },
            sm2Adjustment: null,
            summary: "x",
          },
        }),
      ],
    });
    const result = extractResult(run);
    expect(result?.recommendedTransition).toBeNull();
  });

  test("rejects invalid errorType in sm2Adjustment", () => {
    const run = makeRun({
      steps: [
        makeStep({
          skillName: "evaluate_mastery",
          status: "SUCCESS",
          output: {
            recommendedTransition: null,
            sm2Adjustment: {
              errorType: "unknown_type",
              intervalMultiplier: 0.5,
            },
            summary: "x",
          },
        }),
      ],
    });
    const result = extractResult(run);
    expect(result?.sm2Adjustment).toBeNull();
  });

  test("rejects negative intervalMultiplier", () => {
    const run = makeRun({
      steps: [
        makeStep({
          skillName: "evaluate_mastery",
          status: "SUCCESS",
          output: {
            recommendedTransition: null,
            sm2Adjustment: {
              errorType: "concept",
              intervalMultiplier: -1,
            },
            summary: "x",
          },
        }),
      ],
    });
    const result = extractResult(run);
    expect(result?.sm2Adjustment).toBeNull();
  });

  test("ignores FAILED evaluate_mastery step", () => {
    const run = makeRun({
      steps: [
        makeStep({
          skillName: "evaluate_mastery",
          status: "FAILED",
          output: {
            recommendedTransition: {
              from: "REVIEWING",
              to: "MASTERED",
              reason: "x",
            },
            sm2Adjustment: null,
            summary: "should-not-use",
          },
          errorMessage: "boom",
        }),
      ],
      finalResponse: undefined,
    });
    const result = extractResult(run);
    expect(result).toBeNull();
  });

  test("returns null when neither step nor finalResponse has usable JSON", () => {
    const run = makeRun({
      steps: [],
      finalResponse: "not valid json at all",
    });
    const result = extractResult(run);
    expect(result).toBeNull();
  });
});

describe("computeMasterySpeed", () => {
  test("returns 0.5 neutral default when history is empty", () => {
    expect(computeMasterySpeed([])).toBe(0.5);
  });

  test("returns 0.5 neutral default when history has no isCorrect signals", () => {
    const history = [
      { type: "REVIEW", content: { note: "x" } },
      { type: "REVIEW", content: null },
    ];
    expect(computeMasterySpeed(history)).toBe(0.5);
  });

  test("computes correct rate from isCorrect entries", () => {
    const history = [
      { type: "REVIEW", content: { isCorrect: true } },
      { type: "REVIEW", content: { isCorrect: true } },
      { type: "REVIEW", content: { isCorrect: false } },
      { type: "REVIEW", content: { isCorrect: true } },
    ];
    expect(computeMasterySpeed(history)).toBeCloseTo(0.75, 5);
  });

  test("caps at 10 most recent records", () => {
    // 15 records: most recent 10 all correct, rest all incorrect
    const history = [
      ...Array.from({ length: 10 }, () => ({
        type: "REVIEW",
        content: { isCorrect: true },
      })),
      ...Array.from({ length: 5 }, () => ({
        type: "REVIEW",
        content: { isCorrect: false },
      })),
    ];
    expect(computeMasterySpeed(history)).toBe(1);
  });

  test("ignores entries without boolean isCorrect", () => {
    const history = [
      { type: "REVIEW", content: { isCorrect: true } },
      { type: "REVIEW", content: { note: "no signal" } },
      { type: "REVIEW", content: { isCorrect: false } },
    ];
    expect(computeMasterySpeed(history)).toBe(0.5);
  });
});
