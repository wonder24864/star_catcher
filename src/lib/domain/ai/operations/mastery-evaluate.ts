/**
 * Mastery Evaluate Operation.
 * Given a student's current MasteryState + SM-2 schedule + recent attempts,
 * returns a recommended transition (optional) and sm2 adjustment (optional).
 *
 * Called by the evaluate-mastery Skill via IPC → callAI("MASTERY_EVALUATE", ...).
 * The handler (worker/handlers/mastery-evaluation.ts) validates the suggestion
 * and writes to Memory (D17: Agent outputs advice, handler writes).
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import {
  masteryEvaluateSchema,
  type MasteryEvaluateOutput,
} from "../harness/schemas/mastery-evaluate";
import { masteryEvaluatePrompt } from "../prompts/mastery-evaluate";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<MasteryEvaluateOutput> = {
  name: "MASTERY_EVALUATE",
  description:
    "Evaluate a student's mastery of a single knowledge point and suggest a MasteryState transition + SM-2 adjustment",
  outputSchema: masteryEvaluateSchema,
  usesVision: false,
};

export interface MasteryEvaluateParams {
  knowledgePointId: string;
  kpName: string;
  currentMasteryStatus: string;
  reviewSchedule: {
    intervalDays: number;
    easeFactor: number;
    consecutiveCorrect: number;
  };
  recentAttempts: Array<{
    taskType: string;
    isCorrect: boolean;
    completedAt: string;
    content?: unknown;
  }>;
  interventionHistory: Array<{
    type: string;
    createdAt: string;
    content?: unknown;
  }>;
  masterySpeed: number;
  currentWorkload: number;
  examProximityDays?: number;
  locale?: string;
  context: AICallContext;
}

/**
 * Evaluate mastery through the AI Harness pipeline.
 */
export async function masteryEvaluate(
  params: MasteryEvaluateParams,
): Promise<AIHarnessResult<MasteryEvaluateOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: masteryEvaluatePrompt,
    variables: {
      knowledgePointId: params.knowledgePointId,
      kpName: params.kpName,
      currentMasteryStatus: params.currentMasteryStatus,
      reviewSchedule: params.reviewSchedule,
      recentAttempts: params.recentAttempts,
      interventionHistory: params.interventionHistory,
      masterySpeed: params.masterySpeed,
      currentWorkload: params.currentWorkload,
      examProximityDays: params.examProximityDays,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
