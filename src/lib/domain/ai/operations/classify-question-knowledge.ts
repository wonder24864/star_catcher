/**
 * Question-Knowledge Classification Operation.
 * Classifies the relevance between a question and candidate knowledge points.
 *
 * Called by the classify-question-knowledge Skill via IPC → callAI("CLASSIFY_QUESTION_KNOWLEDGE", ...).
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { classifyQuestionKnowledgeSchema, type ClassifyQuestionKnowledgeOutput } from "../harness/schemas/classify-question-knowledge";
import { classifyQuestionKnowledgePrompt } from "../prompts/classify-question-knowledge";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<ClassifyQuestionKnowledgeOutput> = {
  name: "CLASSIFY_QUESTION_KNOWLEDGE",
  description: "Classify relevance between a question and candidate knowledge points",
  outputSchema: classifyQuestionKnowledgeSchema,
  usesVision: false,
};

export interface ClassifyQuestionKnowledgeParams {
  questionText: string;
  questionSubject: string;
  questionGrade?: string;
  candidates: Array<{ id: string; name: string; description?: string }>;
  locale?: string;
  context: AICallContext;
}

/**
 * Classify question-knowledge relevance through the AI Harness pipeline.
 */
export async function classifyQuestionKnowledge(
  params: ClassifyQuestionKnowledgeParams,
): Promise<AIHarnessResult<ClassifyQuestionKnowledgeOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: classifyQuestionKnowledgePrompt,
    variables: {
      questionText: params.questionText,
      questionSubject: params.questionSubject,
      questionGrade: params.questionGrade,
      candidates: params.candidates,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
