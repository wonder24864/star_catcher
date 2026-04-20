/**
 * OCR Recognition Operation.
 * Orchestrates the full flow: images → AI Harness → structured questions.
 *
 * Business code calls this function, NOT the Harness or Provider directly.
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIOperation, AICallContext, AIHarnessResult } from "../harness/types";
import { recognizeHomeworkSchema, type RecognizeHomeworkOutput } from "../harness/schemas/recognize-homework";
import { recognizeHomeworkPrompt } from "../prompts/recognize-homework";
import { executeOperation } from "../harness";
import { getAIProvider } from "../singleton";

const operation: AIOperation<RecognizeHomeworkOutput> = {
  name: "OCR_RECOGNIZE",
  description: "Recognize homework images and extract questions with answers",
  outputSchema: recognizeHomeworkSchema,
  usesVision: true,
  // A full homework page (multiple questions, each with content + answers +
  // knowledge points + image regions) routinely exceeds the 8000-char default.
  // 30000 chars ≈ ~25 typical questions; hard schema validation still applies.
  maxOutputLength: 30000,
};

export interface RecognizeHomeworkParams {
  /** Presigned URLs for the homework images (ordered) */
  imageUrls: string[];
  /** User context for logging and rate limiting */
  context: AICallContext;
  /** Whether images have EXIF orientation data */
  hasExif?: boolean;
}

/**
 * Recognize homework from images through the AI Harness pipeline.
 *
 * Call convention:
 * - result.success === true → read result.data
 * - result.error?.retryable === true → throw for BullMQ retry
 * - Otherwise → use fallback (RECOGNITION_FAILED)
 */
export async function recognizeHomework(
  params: RecognizeHomeworkParams
): Promise<AIHarnessResult<RecognizeHomeworkOutput>> {
  const provider = getAIProvider();

  return executeOperation(provider, {
    operation,
    prompt: recognizeHomeworkPrompt,
    variables: {
      imageUrls: params.imageUrls,
      locale: params.context.locale,
      grade: params.context.grade,
      hasExif: params.hasExif ?? false,
    },
    context: params.context,
  });
}
