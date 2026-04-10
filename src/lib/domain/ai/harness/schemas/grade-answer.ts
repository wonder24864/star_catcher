import { z } from "zod";

/**
 * Zod schema for grade-answer operation output.
 * AI grades a single student answer: correct or not, with confidence.
 */
export const gradeAnswerSchema = z.object({
  isCorrect: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type GradeAnswerOutput = z.infer<typeof gradeAnswerSchema>;
