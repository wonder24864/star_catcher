import { z } from "zod";

/**
 * Zod schema for intervention plan output.
 * Validates the AI response that generates a daily task plan
 * based on student weakness data.
 */

const dailyTaskItemSchema = z.object({
  type: z.enum(["REVIEW", "PRACTICE", "EXPLANATION"]),
  knowledgePointId: z.string().min(1),
  questionId: z.string().optional(),
  content: z
    .object({
      title: z.string().min(1),
      description: z.string().min(1),
      difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).optional(),
    })
    .passthrough()
    .optional(),
  sortOrder: z.number().int().min(0),
  reason: z.string().min(1),
});

export const interventionPlanSchema = z.object({
  tasks: z.array(dailyTaskItemSchema).min(1),
  reasoning: z.string().min(1),
});

export type InterventionPlanOutput = z.infer<typeof interventionPlanSchema>;
