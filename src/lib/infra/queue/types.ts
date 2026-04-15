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

export interface KGImportJobData {
  fileUrl: string;
  bookTitle: string;
  subject: string;
  grade?: string;
  schoolLevel: string;
  userId: string;
  locale: string;
}

export interface QuestionUnderstandingJobData {
  sessionId: string;
  questionId: string;
  questionText: string;
  subject: string;
  grade?: string;
  schoolLevel: string;
  studentId: string;
  userId: string;
  locale: string;
}

export interface DiagnosisJobData {
  sessionId: string;
  questionId: string;
  errorQuestionId: string;
  questionText: string;
  correctAnswer: string;
  studentAnswer: string;
  subject: string;
  grade?: string;
  knowledgePointIds: string[];
  studentId: string;
  userId: string;
  locale: string;
}

// Phase 3 job data types

export interface LearningBrainJobData {
  studentId: string;
  userId: string;
  locale: string;
}

export interface WeaknessProfileJobData {
  studentId: string;
  userId: string;
  locale: string;
  tier?: "PERIODIC" | "GLOBAL";
}

export interface InterventionPlanningJobData {
  studentId: string;
  knowledgePointIds: string[];
  userId: string;
  locale: string;
}

export interface MasteryEvaluationJobData {
  studentId: string;
  knowledgePointId: string;
  reviewScheduleId: string;
  userId: string;
  locale: string;
}

export interface EmbeddingGenerateJobData {
  errorQuestionId: string;
  userId: string;
  correlationId?: string;
}

export type AIJobData =
  | OcrRecognizeJobData
  | CorrectionPhotosJobData
  | HelpGenerateJobData
  | KGImportJobData
  | QuestionUnderstandingJobData
  | DiagnosisJobData
  | LearningBrainJobData
  | WeaknessProfileJobData
  | InterventionPlanningJobData
  | MasteryEvaluationJobData
  | EmbeddingGenerateJobData;

/** Job names matching ADR-003 timeout/retry configuration */
export type AIJobName =
  | "ocr-recognize"
  | "correction-photos"
  | "help-generate"
  | "kg-import"
  | "question-understanding"
  | "diagnosis"
  | "learning-brain"
  | "weakness-profile"
  | "intervention-planning"
  | "mastery-evaluation"
  | "embedding-generate";
