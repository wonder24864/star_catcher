/**
 * Generate Explanation Operation.
 * Produces a structured ExplanationCard (static / interactive / conversational)
 * for a single error question.
 *
 * Called by the generate-explanation-card Skill via IPC → callAI("GENERATE_EXPLANATION", ...).
 * Also callable directly from `dailyTask.startTask` router for runtime EXPLANATION tasks.
 *
 * See: docs/adr/001-ai-harness-pipeline.md
 *      docs/user-stories/similar-questions-explanation.md (US-052)
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import {
  explanationCardSchema,
  type ExplanationCard,
  type ExplanationFormat,
} from "../harness/schemas/generate-explanation";
import { generateExplanationPrompt } from "../prompts/generate-explanation";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<ExplanationCard> = {
  name: "GENERATE_EXPLANATION",
  description:
    "Generate a structured ExplanationCard (static/interactive/conversational) for a wrong answer",
  outputSchema: explanationCardSchema,
  usesVision: false,
};

export interface GenerateExplanationParams {
  /**
   * Source error question content. Empty string when no specific question
   * is associated (e.g. Intervention Agent generated an EXPLANATION task
   * without questionId) — AI falls back to a KP-level conceptual card.
   */
  questionContent: string;
  correctAnswer?: string | null;
  studentAnswer?: string | null;
  kpName: string;
  subject?: string;
  grade?: string;
  format?: ExplanationFormat | "auto";
  locale?: string;
  context: AICallContext;
}

export async function generateExplanation(
  params: GenerateExplanationParams,
): Promise<AIHarnessResult<ExplanationCard>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: generateExplanationPrompt,
    variables: {
      questionContent: params.questionContent,
      correctAnswer: params.correctAnswer,
      studentAnswer: params.studentAnswer,
      kpName: params.kpName,
      subject: params.subject,
      grade: params.grade,
      format: params.format ?? "auto",
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
