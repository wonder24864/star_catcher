import { z } from "zod";

export const createSessionSchema = z.object({
  studentId: z.string().min(1),
});

export const getSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const startRecognitionSchema = z.object({
  sessionId: z.string().min(1),
});

export const listSessionsSchema = z.object({
  studentId: z.string().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});

export const updateImageOrderSchema = z.object({
  sessionId: z.string().min(1),
  imageIds: z.array(z.string().min(1)).min(1).max(10),
});

export const deleteSessionSchema = z.object({
  sessionId: z.string().min(1),
});

// --- Question CRUD schemas ---

export const updateQuestionSchema = z.object({
  questionId: z.string().min(1),
  content: z.string().min(1).optional(),
  studentAnswer: z.string().nullable().optional(),
  correctAnswer: z.string().nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
  questionType: z.enum([
    "CHOICE", "FILL_BLANK", "TRUE_FALSE", "SHORT_ANSWER",
    "CALCULATION", "ESSAY", "DICTATION_ITEM", "COPY_ITEM", "OTHER",
  ]).optional(),
});

export const deleteQuestionSchema = z.object({
  questionId: z.string().min(1),
});

export const addQuestionSchema = z.object({
  sessionId: z.string().min(1),
  content: z.string().min(1),
  studentAnswer: z.string().nullable().optional(),
  correctAnswer: z.string().nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
  questionType: z.enum([
    "CHOICE", "FILL_BLANK", "TRUE_FALSE", "SHORT_ANSWER",
    "CALCULATION", "ESSAY", "DICTATION_ITEM", "COPY_ITEM", "OTHER",
  ]).optional(),
});

export const confirmResultsSchema = z.object({
  sessionId: z.string().min(1),
  subject: z.enum([
    "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
    "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
  ]).optional(),
  grade: z.enum([
    "PRIMARY_1", "PRIMARY_2", "PRIMARY_3", "PRIMARY_4", "PRIMARY_5", "PRIMARY_6",
    "JUNIOR_1", "JUNIOR_2", "JUNIOR_3",
    "SENIOR_1", "SENIOR_2", "SENIOR_3",
  ]).optional(),
});

export const getCheckStatusSchema = z.object({
  sessionId: z.string().min(1),
});

export const completeSessionSchema = z.object({
  sessionId: z.string().min(1),
});

export const submitCorrectionsSchema = z.object({
  sessionId: z.string().min(1),
  corrections: z
    .array(
      z.object({
        questionId: z.string().min(1),
        newAnswer: z.string().min(1), // Business rule: empty string not a valid answer
      })
    )
    .min(1)
    .max(50),
});

export const submitCorrectionPhotosSchema = z.object({
  sessionId: z.string().min(1),
  imageIds: z.array(z.string().min(1)).min(1).max(10),
});

// --- Manual error input schemas ---

export const createManualErrorSchema = z.object({
  studentId: z.string().min(1),
  content: z.string().min(1).max(5000),
  studentAnswer: z.string().max(2000).optional(),
  correctAnswer: z.string().max(2000).optional(),
  questionType: z.enum([
    "CHOICE", "FILL_BLANK", "TRUE_FALSE", "SHORT_ANSWER",
    "CALCULATION", "ESSAY", "DICTATION_ITEM", "COPY_ITEM", "OTHER",
  ]).optional(),
  /** Override AI-detected subject (used when confidence < 0.8 and user edits) */
  subject: z.enum([
    "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
    "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
  ]).optional(),
});

// --- Help request schemas ---

export const requestHelpSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  level: z.number().int().min(1).max(3) as z.ZodType<1 | 2 | 3>,
});

export const getHelpRequestsSchema = z.object({
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type GetSessionInput = z.infer<typeof getSessionSchema>;
export type ListSessionsInput = z.infer<typeof listSessionsSchema>;
export type UpdateImageOrderInput = z.infer<typeof updateImageOrderSchema>;
export type GetCheckStatusInput = z.infer<typeof getCheckStatusSchema>;
export type CompleteSessionInput = z.infer<typeof completeSessionSchema>;
export type RequestHelpInput = z.infer<typeof requestHelpSchema>;
export type GetHelpRequestsInput = z.infer<typeof getHelpRequestsSchema>;
