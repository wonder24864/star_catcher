/**
 * EVAL_JUDGE Operation — Sprint 16 US-058.
 *
 * Compares an AI operation's actual output against an expected reference and
 * returns a 1-5 score with a pass/fail boolean. Used by EvalRunner for
 * free-text (judgedFields) comparisons; exact-match fields bypass this op.
 *
 * See docs/adr/001-ai-harness-pipeline.md.
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { evalJudgeSchema, type EvalJudgeOutput } from "../harness/schemas/eval-judge";
import { evalJudgePrompt } from "../prompts/eval-judge";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<EvalJudgeOutput> = {
  name: "EVAL_JUDGE",
  description: "Compare AI actual vs expected output, return 1-5 score + pass/fail",
  outputSchema: evalJudgeSchema,
  usesVision: false,
};

export interface EvalJudgeParams {
  operation: string;
  operationDescription: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  locale?: string;
  context: AICallContext;
}

export async function evalJudge(
  params: EvalJudgeParams,
): Promise<AIHarnessResult<EvalJudgeOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: evalJudgePrompt,
    variables: {
      operation: params.operation,
      operationDescription: params.operationDescription,
      expected: params.expected,
      actual: params.actual,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
