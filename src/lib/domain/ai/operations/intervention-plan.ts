/**
 * Intervention Plan Operation.
 * Generates a daily task plan based on student weakness data.
 *
 * Called by the generate-daily-tasks Skill via IPC → callAI("INTERVENTION_PLAN", ...).
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { interventionPlanSchema, type InterventionPlanOutput } from "../harness/schemas/intervention-plan";
import { interventionPlanPrompt } from "../prompts/intervention-plan";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<InterventionPlanOutput> = {
  name: "INTERVENTION_PLAN",
  description: "Generate a personalized daily task plan based on student weakness data",
  outputSchema: interventionPlanSchema,
  usesVision: false,
};

export interface InterventionPlanParams {
  weakPoints: Array<{
    kpId: string;
    kpName: string;
    severity: string;
    trend: string;
    errorCount: number;
  }>;
  maxTasks: number;
  existingErrorQuestions?: Array<{
    id: string;
    content: string;
    knowledgePointId: string;
  }>;
  grade?: string;
  locale?: string;
  context: AICallContext;
}

/**
 * Generate an intervention plan through the AI Harness pipeline.
 */
export async function interventionPlan(
  params: InterventionPlanParams,
): Promise<AIHarnessResult<InterventionPlanOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: interventionPlanPrompt,
    variables: {
      weakPoints: params.weakPoints,
      maxTasks: params.maxTasks,
      existingErrorQuestions: params.existingErrorQuestions,
      grade: params.grade,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
