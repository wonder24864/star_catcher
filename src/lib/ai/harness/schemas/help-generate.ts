import { z } from "zod";

/**
 * Schema for AI-generated help content (progressive reveal).
 *
 * Level 1: Thinking direction (knowledge point + approach hint)
 * Level 2: Key steps (step framework, no final answer)
 * Level 3: Full solution (complete worked solution + answer)
 *
 * See docs/adr/004-progressive-help-reveal.md
 */
export const helpGenerateSchema = z.object({
  helpText: z
    .string()
    .min(1)
    .describe("Markdown-formatted help content, adapted to the requested level"),
  level: z
    .number()
    .int()
    .min(1)
    .max(3)
    .describe("The help level that was generated (1, 2, or 3)"),
  knowledgePoint: z
    .string()
    .optional()
    .describe("The knowledge point being tested (always included for Level 1+)"),
});

export type HelpGenerateOutput = z.infer<typeof helpGenerateSchema>;
