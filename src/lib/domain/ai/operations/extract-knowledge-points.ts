/**
 * Knowledge Point Extraction Operation.
 * Extracts structured knowledge point tree from textbook TOC via AI Harness.
 *
 * Called by the extract-knowledge-points Skill via IPC → callAI("EXTRACT_KNOWLEDGE_POINTS", ...).
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { extractKnowledgePointsSchema, type ExtractKnowledgePointsOutput } from "../harness/schemas/extract-knowledge-points";
import { extractKnowledgePointsPrompt } from "../prompts/extract-knowledge-points";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<ExtractKnowledgePointsOutput> = {
  name: "EXTRACT_KNOWLEDGE_POINTS",
  description: "Extract knowledge point tree from textbook table of contents",
  outputSchema: extractKnowledgePointsSchema,
  usesVision: false,
};

export interface ExtractKnowledgePointsParams {
  /** Table of contents text from the textbook */
  tocText: string;
  /** Full textbook title */
  bookTitle: string;
  /** Subject */
  subject: string;
  /** Grade level */
  grade?: string;
  /** School level */
  schoolLevel: string;
  /** Output locale */
  locale?: string;
  /** User context for logging and rate limiting */
  context: AICallContext;
}

/**
 * Extract knowledge points from textbook TOC through the AI Harness pipeline.
 */
export async function extractKnowledgePoints(
  params: ExtractKnowledgePointsParams,
): Promise<AIHarnessResult<ExtractKnowledgePointsOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: extractKnowledgePointsPrompt,
    variables: {
      tocText: params.tocText,
      bookTitle: params.bookTitle,
      subject: params.subject,
      grade: params.grade,
      schoolLevel: params.schoolLevel,
      locale: params.locale ?? params.context.locale ?? "zh-CN",
    },
    context: params.context,
  });
}
