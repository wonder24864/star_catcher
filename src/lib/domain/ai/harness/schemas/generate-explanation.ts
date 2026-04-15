import { z } from "zod";

/**
 * Zod schema for ExplanationCard AI output.
 * Drives both the AI Harness validation and the React component props.
 *
 * See: docs/user-stories/similar-questions-explanation.md (US-052)
 */

export const explanationStepSchema = z.object({
  content: z.string().min(1),
  question: z.string().optional(),
  expectedAnswer: z.string().optional(),
});

export const explanationFormatSchema = z.enum([
  "static",
  "interactive",
  "conversational",
]);

export const explanationCardSchema = z.object({
  format: explanationFormatSchema,
  title: z.string().min(1),
  steps: z.array(explanationStepSchema).min(1),
  metadata: z
    .object({
      targetGrade: z.string().optional(),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    })
    .passthrough()
    .optional(),
});

export type ExplanationStep = z.infer<typeof explanationStepSchema>;
export type ExplanationFormat = z.infer<typeof explanationFormatSchema>;
export type ExplanationCard = z.infer<typeof explanationCardSchema>;
