import { z } from "zod";

/**
 * Zod schema for knowledge point extraction output.
 * Validates the structured JSON returned by AI when parsing textbook TOC.
 */

const knowledgePointEntrySchema = z.object({
  name: z.string().min(1).max(128),
  parentName: z.string().optional(),
  depth: z.number().int().min(0).max(6),
  order: z.number().int().min(0),
  difficulty: z.number().int().min(1).max(5).optional(),
  prerequisites: z.array(z.string()).optional(),
});

export const extractKnowledgePointsSchema = z.object({
  knowledgePoints: z.array(knowledgePointEntrySchema).min(1),
});

export type ExtractKnowledgePointsOutput = z.infer<typeof extractKnowledgePointsSchema>;
