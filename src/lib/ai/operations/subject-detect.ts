/**
 * Subject-Detect Operation.
 * Auto-detects subject and content type from manually entered question text
 * through the AI Harness pipeline.
 *
 * Business code calls this function, NOT the Harness or Provider directly.
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { subjectDetectSchema, type SubjectDetectOutput } from "../harness/schemas/subject-detect";
import { subjectDetectPrompt } from "../prompts/subject-detect";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<SubjectDetectOutput> = {
  name: "SUBJECT_DETECT",
  description: "Detect subject and content type from manually entered question",
  outputSchema: subjectDetectSchema,
  usesVision: false,
};

export interface SubjectDetectParams {
  /** The question text to classify */
  questionContent: string;
  /** Optional student answer for additional context */
  studentAnswer?: string;
  /** User context for logging and rate limiting */
  context: AICallContext;
}

/**
 * Detect the subject of a manually entered question through the AI Harness pipeline.
 *
 * Call convention:
 * - result.success && result.data.confidence >= 0.8 → auto-accept subject
 * - result.success && result.data.confidence < 0.8 → show as editable default
 * - result.fallback → defaults to { subject: 'OTHER', confidence: 0 }
 */
export async function detectSubject(
  params: SubjectDetectParams
): Promise<AIHarnessResult<SubjectDetectOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: subjectDetectPrompt,
    variables: {
      questionContent: params.questionContent,
      studentAnswer: params.studentAnswer ?? "",
      locale: params.context.locale,
    },
    context: params.context,
  });
}
