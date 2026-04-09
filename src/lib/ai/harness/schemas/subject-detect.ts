import { z } from "zod";

/**
 * Schema for AI subject detection from manually entered question text.
 *
 * Used by the manual input flow (US-010) to auto-detect subject
 * when a student types in a question.
 */
export const subjectDetectSchema = z.object({
  subject: z.enum([
    "MATH",
    "CHINESE",
    "ENGLISH",
    "PHYSICS",
    "CHEMISTRY",
    "BIOLOGY",
    "POLITICS",
    "HISTORY",
    "GEOGRAPHY",
    "OTHER",
  ]),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Detection confidence; >= 0.8 means auto-accept"),
  contentType: z
    .enum([
      "EXAM",
      "HOMEWORK",
      "DICTATION",
      "COPYWRITING",
      "ORAL_CALC",
      "COMPOSITION",
      "OTHER",
    ])
    .optional()
    .describe("Detected content type, if identifiable"),
});

export type SubjectDetectOutput = z.infer<typeof subjectDetectSchema>;
