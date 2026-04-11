import { z } from "zod";

/**
 * Zod schema for question-knowledge classification output.
 * Validates the AI response that maps a question to knowledge points with confidence.
 */

const classifyMappingSchema = z.object({
  knowledgePointId: z.string().min(1),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(1),
});

export const classifyQuestionKnowledgeSchema = z.object({
  mappings: z.array(classifyMappingSchema),
});

export type ClassifyQuestionKnowledgeOutput = z.infer<typeof classifyQuestionKnowledgeSchema>;
