/**
 * Grade-Answer Operation.
 * Grades a single student answer through the AI Harness pipeline.
 *
 * Business code calls this function, NOT the Harness or Provider directly.
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { gradeAnswerSchema, type GradeAnswerOutput } from "../harness/schemas/grade-answer";
import { gradeAnswerPrompt } from "../prompts/grade-answer";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<GradeAnswerOutput> = {
  name: "GRADE_ANSWER",
  description: "Grade a single student answer as correct or incorrect",
  outputSchema: gradeAnswerSchema,
  usesVision: false,
};

export interface GradeAnswerParams {
  /** The question text */
  questionContent: string;
  /** The student's submitted answer */
  studentAnswer: string;
  /** The expected correct answer (used internally, never returned to student) */
  correctAnswer?: string | null;
  /** Subject for context-appropriate grading */
  subject?: string;
  /** Grade level for rubric adaptation */
  grade?: string;
  /** User context for logging and rate limiting */
  context: AICallContext;
}

/**
 * Grade a student's corrected answer through the AI Harness pipeline.
 *
 * Call convention:
 * - result.success === true → read result.data.isCorrect
 * - result.success === false → treat answer as incorrect, mark needsReview
 */
export async function gradeAnswer(
  params: GradeAnswerParams
): Promise<AIHarnessResult<GradeAnswerOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: gradeAnswerPrompt,
    variables: {
      questionContent: params.questionContent,
      studentAnswer: params.studentAnswer,
      correctAnswer: params.correctAnswer ?? null,
      subject: params.subject,
      grade: params.grade,
      locale: params.context.locale,
    },
    context: params.context,
  });
}
