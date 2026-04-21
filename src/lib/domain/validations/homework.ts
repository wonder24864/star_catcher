import { z } from "zod";
import { gradeEnum } from "./grade";

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
  grade: gradeEnum.optional(),
});

export const getCheckStatusSchema = z.object({
  sessionId: z.string().min(1),
});

export const completeSessionSchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * Unified mutation for the canvas UX (Sprint 17).
 *
 * One of two concrete actions depending on session status:
 * - RECOGNIZED → create CheckRound #1 + transition to CHECKING
 *   (same body as confirmResults). If all-correct, also flips to COMPLETED
 *   and runs the ErrorQuestion / Question Understanding side-effects.
 * - CHECKING → transition to COMPLETED if all-correct
 *   (same body as completeSession).
 *
 * Returns `{ status: "NEEDS_CORRECTIONS", wrongCount }` when status is
 * CHECKING but wrongCount > 0 — the UI then shows the "还有 N 题待改" banner
 * and the re-take flow instead of forcing COMPLETED with wrong answers.
 */
export const finalizeCheckSchema = z.object({
  sessionId: z.string().min(1),
  subject: z.enum([
    "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
    "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
  ]).optional(),
  grade: gradeEnum.optional(),
  /**
   * CHECKING + wrongCount>0 returns NEEDS_CORRECTIONS by default so students
   * don't accidentally close out with wrong answers. Set force=true after the
   * "结束检查 (there are N wrong)" confirm dialog to skip that gate and
   * transition to COMPLETED anyway — used when the student explicitly chooses
   * to stop rather than retake.
   */
  force: z.boolean().optional(),
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
