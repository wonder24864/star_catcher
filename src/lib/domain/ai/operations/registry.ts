/**
 * Operation Registry — universal AI operation routing.
 *
 * Maps AIOperationType → operation function so that IPC handlers
 * can route Skill callAI() requests without hardcoded switch statements.
 *
 * Usage:
 *   const result = await callAIOperation("DIAGNOSE_ERROR", data, aiContext);
 *
 * See: docs/sprints/sprint-9-skill-gap.md (Task 82)
 */

import type { AIOperationType } from "@prisma/client";
import type { AICallContext, AIHarnessResult } from "../harness/types";
import { recognizeHomework } from "./recognize-homework";
import { detectSubject } from "./subject-detect";
import { generateHelp } from "./help-generate";
import { gradeAnswer } from "./grade-answer";
import { extractKnowledgePoints } from "./extract-knowledge-points";
import { classifyQuestionKnowledge } from "./classify-question-knowledge";
import { diagnoseError } from "./diagnose-error";
import { interventionPlan } from "./intervention-plan";
import { masteryEvaluate } from "./mastery-evaluate";
import { generateExplanation } from "./generate-explanation";
import type { ExplanationFormat } from "../harness/schemas/generate-explanation";
import { evalJudge } from "./eval-judge";

/**
 * Each operation adapter normalizes the generic `data` bag into
 * the typed params that the operation function expects.
 */
type OperationAdapter = (
  data: Record<string, unknown>,
  context: AICallContext,
) => Promise<AIHarnessResult<unknown>>;

const OPERATION_REGISTRY: Record<AIOperationType, OperationAdapter> = {
  OCR_RECOGNIZE: (data, context) =>
    recognizeHomework({
      imageUrls: data.imageUrls as string[],
      hasExif: data.hasExif as boolean | undefined,
      context,
    }),

  SUBJECT_DETECT: (data, context) =>
    detectSubject({
      questionContent: data.questionContent as string,
      studentAnswer: data.studentAnswer as string | undefined,
      context,
    }),

  HELP_GENERATE: (data, context) =>
    generateHelp({
      questionContent: data.questionContent as string,
      studentAnswer: data.studentAnswer as string,
      correctAnswer: data.correctAnswer as string | undefined,
      helpLevel: data.helpLevel as 1 | 2 | 3,
      subject: data.subject as string | undefined,
      grade: data.grade as string | undefined,
      context,
    }),

  GRADE_ANSWER: (data, context) =>
    gradeAnswer({
      questionContent: data.questionContent as string,
      studentAnswer: data.studentAnswer as string,
      correctAnswer: data.correctAnswer as string | null | undefined,
      subject: data.subject as string | undefined,
      grade: data.grade as string | undefined,
      context,
    }),

  EXTRACT_KNOWLEDGE_POINTS: (data, context) =>
    extractKnowledgePoints({
      tocText: data.tocText as string,
      bookTitle: data.bookTitle as string,
      subject: data.subject as string,
      grade: data.grade as string | undefined,
      schoolLevel: data.schoolLevel as string,
      locale: data.locale as string | undefined,
      context,
    }),

  CLASSIFY_QUESTION_KNOWLEDGE: (data, context) =>
    classifyQuestionKnowledge({
      questionText: data.questionText as string,
      questionSubject: data.questionSubject as string,
      questionGrade: data.questionGrade as string | undefined,
      candidates: data.candidates as Array<{
        id: string;
        name: string;
        description?: string;
      }>,
      locale: data.locale as string | undefined,
      context,
    }),

  DIAGNOSE_ERROR: (data, context) =>
    diagnoseError({
      question: data.question as string,
      correctAnswer: data.correctAnswer as string,
      studentAnswer: data.studentAnswer as string,
      subject: data.subject as string,
      grade: data.grade as string | undefined,
      knowledgePoints: data.knowledgePoints as
        | Array<{ id: string; name: string; description?: string }>
        | undefined,
      errorHistory: data.errorHistory as
        | Array<{
            question: string;
            studentAnswer: string;
            knowledgePointName: string;
            createdAt: string;
          }>
        | undefined,
      locale: data.locale as string | undefined,
      context,
    }),

  // Phase 3 stubs — implementations in later sprints
  WEAKNESS_PROFILE: () => {
    throw new Error("WEAKNESS_PROFILE operation not yet implemented");
  },
  INTERVENTION_PLAN: (data, context) =>
    interventionPlan({
      weakPoints: data.weakPoints as Array<{
        kpId: string;
        kpName: string;
        severity: string;
        trend: string;
        errorCount: number;
      }>,
      maxTasks: data.maxTasks as number,
      existingErrorQuestions: data.existingErrorQuestions as
        | Array<{ id: string; content: string; knowledgePointId: string }>
        | undefined,
      grade: data.grade as string | undefined,
      locale: data.locale as string | undefined,
      context,
    }),
  MASTERY_EVALUATE: (data, context) =>
    masteryEvaluate({
      knowledgePointId: data.knowledgePointId as string,
      kpName: data.kpName as string,
      currentMasteryStatus: data.currentMasteryStatus as string,
      reviewSchedule: data.reviewSchedule as {
        intervalDays: number;
        easeFactor: number;
        consecutiveCorrect: number;
      },
      recentAttempts: data.recentAttempts as Array<{
        taskType: string;
        isCorrect: boolean;
        completedAt: string;
        content?: unknown;
      }>,
      interventionHistory: data.interventionHistory as Array<{
        type: string;
        createdAt: string;
        content?: unknown;
      }>,
      masterySpeed: data.masterySpeed as number,
      currentWorkload: data.currentWorkload as number,
      examProximityDays: data.examProximityDays as number | undefined,
      locale: data.locale as string | undefined,
      context,
    }),
  // FIND_SIMILAR is intentionally NOT implemented as an AI operation.
  // Similar-question retrieval is a deterministic dual-path query (KP + pgvector cosine).
  // Use the `findSimilarQuestions` domain function in src/lib/domain/similar-questions/find.ts
  // (or invoke the find-similar-questions Skill which delegates to that function via ctx.query).
  FIND_SIMILAR: () => {
    throw new Error(
      "FIND_SIMILAR is not an AI operation — call findSimilarQuestions() domain function or invoke the find-similar-questions Skill",
    );
  },

  GENERATE_EXPLANATION: (data, context) =>
    generateExplanation({
      questionContent: data.questionContent as string,
      correctAnswer: data.correctAnswer as string | null | undefined,
      studentAnswer: data.studentAnswer as string | null | undefined,
      kpName: data.kpName as string,
      subject: data.subject as string | undefined,
      grade: data.grade as string | undefined,
      format: data.format as ExplanationFormat | "auto" | undefined,
      locale: data.locale as string | undefined,
      context,
    }),
  EVAL_JUDGE: (data, context) =>
    evalJudge({
      operation: data.operation as string,
      operationDescription: data.operationDescription as string,
      expected: data.expected as Record<string, unknown>,
      actual: data.actual as Record<string, unknown>,
      locale: data.locale as string | undefined,
      context,
    }),
};

/**
 * Route an AI operation by name through the Harness pipeline.
 *
 * @param operation - AIOperationType enum value (e.g. "DIAGNOSE_ERROR")
 * @param data      - Operation-specific params from the Skill
 * @param context   - AICallContext injected by the handler
 * @returns AIHarnessResult with parsed output
 * @throws Error if the operation is unknown
 */
export async function callAIOperation(
  operation: string,
  data: Record<string, unknown>,
  context: AICallContext,
): Promise<AIHarnessResult<unknown>> {
  const adapter = OPERATION_REGISTRY[operation as AIOperationType];
  if (!adapter) {
    throw new Error(`Unknown AI operation: ${operation}`);
  }
  return adapter(data, context);
}
