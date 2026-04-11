import { z } from "zod";

/**
 * Zod schema for error diagnosis output.
 * Validates the AI response that diagnoses student error patterns
 * and identifies weak knowledge points.
 */

export const errorPatternEnum = z.enum([
  "CONCEPT_CONFUSION",
  "CALCULATION_ERROR",
  "METHOD_WRONG",
  "CARELESS",
  "OTHER",
]);

const weakKnowledgePointSchema = z.object({
  knowledgePointId: z.string().min(1),
  severity: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reasoning: z.string().min(1),
});

export const diagnoseErrorSchema = z.object({
  errorPattern: errorPatternEnum,
  errorDescription: z.string().min(1),
  weakKnowledgePoints: z.array(weakKnowledgePointSchema),
  recommendation: z.string().min(1),
});

export type DiagnoseErrorOutput = z.infer<typeof diagnoseErrorSchema>;
