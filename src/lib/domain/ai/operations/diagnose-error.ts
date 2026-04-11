/**
 * Error Diagnosis Operation.
 * Analyzes student error patterns and identifies weak knowledge points.
 *
 * Called by the diagnose-error Skill via IPC → callAI("DIAGNOSE_ERROR", ...).
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { diagnoseErrorSchema, type DiagnoseErrorOutput } from "../harness/schemas/diagnose-error";
import { diagnoseErrorPrompt } from "../prompts/diagnose-error";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<DiagnoseErrorOutput> = {
  name: "DIAGNOSE_ERROR",
  description: "Diagnose student error patterns and identify weak knowledge points",
  outputSchema: diagnoseErrorSchema,
  usesVision: false,
};

export interface DiagnoseErrorParams {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  subject: string;
  grade?: string;
  knowledgePoints?: Array<{ id: string; name: string; description?: string }>;
  errorHistory?: Array<{ question: string; studentAnswer: string; knowledgePointName: string; createdAt: string }>;
  locale?: string;
  context: AICallContext;
}

/**
 * Diagnose student error through the AI Harness pipeline.
 */
export async function diagnoseError(
  params: DiagnoseErrorParams,
): Promise<AIHarnessResult<DiagnoseErrorOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: diagnoseErrorPrompt,
    variables: {
      question: params.question,
      correctAnswer: params.correctAnswer,
      studentAnswer: params.studentAnswer,
      subject: params.subject,
      grade: params.grade,
      knowledgePoints: params.knowledgePoints,
      errorHistory: params.errorHistory,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
