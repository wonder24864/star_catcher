/**
 * BullMQ job payload types.
 * See docs/adr/003-bullmq-async-ai.md
 */

export interface OcrRecognizeJobData {
  sessionId: string;
  userId: string;
  locale: string;
  grade?: string;
  /** TaskRun.id from the unified task system (ADR-012). Optional for legacy paths. */
  taskId?: string;
}

export interface CorrectionPhotosJobData {
  sessionId: string;
  imageIds: string[];
  userId: string;
  locale: string;
  grade?: string;
  taskId?: string;
}

export interface HelpGenerateJobData {
  sessionId: string;
  questionId: string;
  userId: string;
  locale: string;
  grade?: string;
  level: 1 | 2 | 3;
  subject?: string;
  taskId?: string;
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
  taskId?: string;
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

/**
 * Eval run job — Sprint 16 US-058. EvalRun row is pre-created with
 * status=RUNNING by the tRPC trigger; handler runs EvalRunner and writes
 * cases + finalizes status.
 */
export interface EvalRunJobData {
  runId: string;
  operations: string[]; // AIOperationType[] — strings to avoid circular import
  userId: string;       // triggering admin
  locale: string;
  taskId?: string;
}

/**
 * Learning suggestion job — Sprint 18 US-061. Handler loads weakness/mastery
 * data, calls LEARNING_SUGGESTION AI operation, writes LearningSuggestion row.
 */
export interface LearningSuggestionJobData {
  studentId: string;       // "__all__" for weekly fanout
  userId: string;
  locale: string;
  type?: "WEEKLY_AUTO" | "ON_DEMAND";
  taskId?: string;
}

/**
 * Generate-explanation job — parent requests a structured solution card
 * for a specific ErrorQuestion. Worker calls GENERATE_EXPLANATION and
 * caches the result on ErrorQuestion.explanation (ADR-013).
 */
export interface GenerateExplanationJobData {
  errorQuestionId: string;
  userId: string;            // triggering parent
  studentId: string;         // for RBAC in worker
  locale: string;
  taskId?: string;
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
  | EmbeddingGenerateJobData
  | EvalRunJobData
  | LearningSuggestionJobData
  | GenerateExplanationJobData;

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
  | "embedding-generate"
  | "eval-run"
  | "learning-suggestion"
  | "generate-explanation";
