/**
 * Learning Suggestion Operation.
 * Generates personalized learning suggestions based on weakness data,
 * mastery states, and intervention history.
 *
 * Called by the learning-suggestion handler via callAIOperation("LEARNING_SUGGESTION", ...).
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { learningSuggestionSchema, type LearningSuggestionOutput } from "../harness/schemas/learning-suggestion";
import { learningSuggestionPrompt } from "../prompts/learning-suggestion";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<LearningSuggestionOutput> = {
  name: "LEARNING_SUGGESTION",
  description: "Generate personalized learning suggestions for a student",
  outputSchema: learningSuggestionSchema,
  usesVision: false,
};

export interface LearningSuggestionParams {
  weakPoints: Array<{
    kpId: string;
    kpName: string;
    severity: string;
    trend: string;
    errorCount: number;
  }>;
  masteryStates: Array<{
    kpId: string;
    kpName: string;
    status: string;
    correctRate: number;
  }>;
  interventionHistory: Array<{
    kpName: string;
    type: string;
    createdAt: string;
    preMasteryStatus: string | null;
  }>;
  grade?: string;
  locale?: string;
  context: AICallContext;
}

/**
 * Generate learning suggestions through the AI Harness pipeline.
 */
export async function learningSuggestion(
  params: LearningSuggestionParams,
): Promise<AIHarnessResult<LearningSuggestionOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: learningSuggestionPrompt,
    variables: {
      weakPoints: params.weakPoints,
      masteryStates: params.masteryStates,
      interventionHistory: params.interventionHistory,
      grade: params.grade,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
