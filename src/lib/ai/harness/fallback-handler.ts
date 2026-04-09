import type { AIOperationType } from "@prisma/client";
import type { AIHarnessResult } from "./types";

/**
 * Per-operation fallback strategies when AI calls fail.
 * Returns a degraded but safe result.
 */
export function getFallbackResult<T>(
  operationType: AIOperationType,
  locale: string
): AIHarnessResult<T> {
  switch (operationType) {
    case "OCR_RECOGNIZE":
      // Don't fabricate data — let the caller handle RECOGNITION_FAILED
      return {
        success: false,
        error: {
          message: locale === "zh"
            ? "识别失败，请重试或手动录入"
            : "Recognition failed. Please retry or enter manually.",
          code: "RECOGNITION_FAILED",
          retryable: false,
        },
        fallback: true,
      };

    case "SUBJECT_DETECT":
      return {
        success: true,
        data: { subject: "OTHER", confidence: 0 } as T,
        fallback: true,
      };

    case "HELP_GENERATE":
      return {
        success: true,
        data: {
          content: locale === "zh"
            ? "请仔细审题，思考已知条件和要求的关系。"
            : "Read the problem carefully and think about the relationship between given conditions and requirements.",
          level: 1,
        } as T,
        fallback: true,
      };

    default:
      return {
        success: false,
        error: {
          message: "Operation failed",
          code: "UNKNOWN_OPERATION",
          retryable: false,
        },
        fallback: true,
      };
  }
}
