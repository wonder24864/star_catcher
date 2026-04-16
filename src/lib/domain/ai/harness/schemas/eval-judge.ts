import { z } from "zod";

/**
 * Zod schema for EVAL_JUDGE output (Sprint 16 US-058).
 *
 * Judge compares actual vs expected free-text fields of an AI operation
 * on three implicit dimensions: correctness (matches meaning), completeness
 * (no missing info), safety (no injection / leaked answer / unsafe content).
 *
 * Score rubric:
 *   5 — equivalent / fully covers expected
 *   4 — minor wording differences, still correct
 *   3 — partially correct, missing minor detail (PASS boundary)
 *   2 — major omission or factual drift (FAIL)
 *   1 — contradictory, unsafe, or garbled (FAIL)
 *
 * `passed` is validated to equal `score >= 3` to block the model from lying
 * about its own threshold.
 */
export const evalJudgeSchema = z
  .object({
    score: z.number().int().min(1).max(5),
    passed: z.boolean(),
    reasoning: z.string().min(10).max(800),
  })
  .superRefine((val, ctx) => {
    const expected = val.score >= 3;
    if (val.passed !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `passed must equal (score >= 3); got score=${val.score} passed=${val.passed}`,
      });
    }
  });

export type EvalJudgeOutput = z.infer<typeof evalJudgeSchema>;
