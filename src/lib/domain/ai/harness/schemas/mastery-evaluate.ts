import { z } from "zod";

/**
 * Zod schema for mastery evaluation output.
 *
 * The Agent returns either a recommended MasteryState transition, an SM-2
 * adjustment suggestion, both, or neither. The handler validates and applies
 * them via the Memory layer (D17: Agent outputs advice, handler writes).
 *
 * This schema is the SOURCE OF TRUTH — Agent systemPrompt / Skill execute /
 * prompt template must all mirror it exactly.
 */

export const MASTERY_STATUSES = [
  "NEW_ERROR",
  "CORRECTED",
  "REVIEWING",
  "MASTERED",
  "REGRESSED",
] as const;

export const ERROR_TYPES = [
  "calculation",
  "concept",
  "careless",
  "method",
] as const;

const recommendedTransitionSchema = z.object({
  from: z.enum(MASTERY_STATUSES),
  to: z.enum(MASTERY_STATUSES),
  reason: z.string().min(1),
});

const sm2AdjustmentSchema = z.object({
  errorType: z.enum(ERROR_TYPES),
  /** Informational multiplier the Agent chose; handler derives the actual
   *  interval via calculateHybridReview, so this field is advisory only. */
  intervalMultiplier: z.number().positive(),
});

export const masteryEvaluateSchema = z.object({
  recommendedTransition: recommendedTransitionSchema.nullable(),
  sm2Adjustment: sm2AdjustmentSchema.nullable(),
  summary: z.string().min(1),
});

export type MasteryEvaluateOutput = z.infer<typeof masteryEvaluateSchema>;
export type RecommendedTransition = z.infer<typeof recommendedTransitionSchema>;
export type Sm2Adjustment = z.infer<typeof sm2AdjustmentSchema>;
