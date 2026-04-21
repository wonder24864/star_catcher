import { z } from "zod";

/**
 * Zod schema for OCR recognition output.
 * Validates the structured JSON returned by GPT-5.4 Vision.
 */

const questionSchema = z.object({
  questionNumber: z.number().int().positive(),
  questionType: z.enum([
    "CHOICE", "FILL_BLANK", "TRUE_FALSE", "SHORT_ANSWER",
    "CALCULATION", "ESSAY", "DICTATION_ITEM", "COPY_ITEM", "OTHER",
  ]),
  content: z.string().min(1),
  studentAnswer: z.string().nullable(),
  correctAnswer: z.string().nullable().optional(),
  isCorrect: z.boolean().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
  // 0-based index into the imageUrls[] array — which source image this
  // question was extracted from. Required for the canvas UI to render
  // the bbox on the right image. Omit (or set 0) for single-image input.
  sourceImageIndex: z.number().int().min(0).optional(),
  imageRegion: z.object({
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    w: z.number().min(0).max(100),
    h: z.number().min(0).max(100),
  }).optional(),
  knowledgePoint: z.string().optional(),
});

export const recognizeHomeworkSchema = z.object({
  subject: z.enum([
    "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
    "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
  ]),
  subjectConfidence: z.number().min(0).max(1),
  contentType: z.enum([
    "EXAM", "HOMEWORK", "DICTATION", "COPYWRITING",
    "ORAL_CALC", "COMPOSITION", "OTHER",
  ]),
  grade: z.string().optional(),
  title: z.string().optional(),
  questions: z.array(questionSchema).min(1),
  totalScore: z.number().int().min(0).max(100).optional(),
  correctCount: z.number().int().min(0).optional(),
});

export type RecognizeHomeworkOutput = z.infer<typeof recognizeHomeworkSchema>;
