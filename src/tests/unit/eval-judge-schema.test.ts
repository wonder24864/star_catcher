/**
 * Unit: EVAL_JUDGE output schema (Sprint 16 US-058).
 *
 * Ensures the AI cannot lie about the pass flag.
 */
import { describe, test, expect } from "vitest";
import { evalJudgeSchema } from "@/lib/domain/ai/harness/schemas/eval-judge";

describe("evalJudgeSchema", () => {
  test("accepts pass at score=3", () => {
    const parsed = evalJudgeSchema.parse({
      score: 3,
      passed: true,
      reasoning: "Minor wording difference only.",
    });
    expect(parsed.score).toBe(3);
  });

  test("accepts fail at score=2", () => {
    const parsed = evalJudgeSchema.parse({
      score: 2,
      passed: false,
      reasoning: "Missing the key concept.",
    });
    expect(parsed.passed).toBe(false);
  });

  test("rejects lying passed flag (score=2, passed=true)", () => {
    expect(() =>
      evalJudgeSchema.parse({
        score: 2,
        passed: true,
        reasoning: "Lying judge attempts to pass.",
      }),
    ).toThrow();
  });

  test("rejects lying passed flag (score=5, passed=false)", () => {
    expect(() =>
      evalJudgeSchema.parse({
        score: 5,
        passed: false,
        reasoning: "Lying judge attempts to fail equivalent output.",
      }),
    ).toThrow();
  });

  test("rejects out-of-range score", () => {
    expect(() =>
      evalJudgeSchema.parse({
        score: 7,
        passed: true,
        reasoning: "Out of range.",
      }),
    ).toThrow();
    expect(() =>
      evalJudgeSchema.parse({
        score: 0,
        passed: false,
        reasoning: "Out of range.",
      }),
    ).toThrow();
  });

  test("rejects non-integer score", () => {
    expect(() =>
      evalJudgeSchema.parse({
        score: 3.5,
        passed: true,
        reasoning: "Fractional score not allowed.",
      }),
    ).toThrow();
  });

  test("rejects too-short reasoning", () => {
    expect(() =>
      evalJudgeSchema.parse({
        score: 3,
        passed: true,
        reasoning: "ok",
      }),
    ).toThrow();
  });
});
