/**
 * Help-Generate Operation.
 * Generates progressive help content (3 levels) through the AI Harness pipeline.
 *
 * Business code calls this function, NOT the Harness or Provider directly.
 * See docs/adr/001-ai-harness-pipeline.md
 * See docs/adr/004-progressive-help-reveal.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { helpGenerateSchema, type HelpGenerateOutput } from "../harness/schemas/help-generate";
import { helpGeneratePrompt } from "../prompts/help-generate";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<HelpGenerateOutput> = {
  name: "HELP_GENERATE",
  description: "Generate progressive help content for a wrong answer",
  outputSchema: helpGenerateSchema,
  usesVision: false,
};

export interface HelpGenerateParams {
  /** The question text */
  questionContent: string;
  /** The student's current (incorrect) answer */
  studentAnswer: string;
  /** The correct answer (used to generate accurate help, never exposed at L1/L2) */
  correctAnswer?: string;
  /** Help level: 1 = direction, 2 = key steps, 3 = full solution */
  helpLevel: 1 | 2 | 3;
  /** Subject for context-appropriate tutoring */
  subject?: string;
  /** Grade level for age-appropriate language */
  grade?: string;
  /** User context for logging and rate limiting */
  context: AICallContext;
}

/**
 * Generate help for a student's wrong answer through the AI Harness pipeline.
 *
 * Call convention:
 * - result.success === true → read result.data.helpText
 * - result.success === false && result.fallback → use static fallback text
 * - result.success === false && !result.fallback → show generic error
 */
export async function generateHelp(
  params: HelpGenerateParams
): Promise<AIHarnessResult<HelpGenerateOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: helpGeneratePrompt,
    variables: {
      questionContent: params.questionContent,
      studentAnswer: params.studentAnswer,
      correctAnswer: params.correctAnswer,
      helpLevel: params.helpLevel,
      subject: params.subject,
      grade: params.grade,
      locale: params.context.locale,
    },
    context: params.context,
  });
}
