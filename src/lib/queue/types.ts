/**
 * BullMQ job payload types.
 * See docs/adr/003-bullmq-async-ai.md
 */

export interface OcrRecognizeJobData {
  sessionId: string;
  userId: string;
  locale: string;
  grade?: string;
}

export interface CorrectionPhotosJobData {
  sessionId: string;
  imageIds: string[];
  userId: string;
  locale: string;
  grade?: string;
}

export interface HelpGenerateJobData {
  sessionId: string;
  questionId: string;
  userId: string;
  locale: string;
  grade?: string;
  level: 1 | 2 | 3;
  subject?: string;
}

export type AIJobData =
  | OcrRecognizeJobData
  | CorrectionPhotosJobData
  | HelpGenerateJobData;

/** Job names matching ADR-003 timeout/retry configuration */
export type AIJobName = "ocr-recognize" | "correction-photos" | "help-generate";
