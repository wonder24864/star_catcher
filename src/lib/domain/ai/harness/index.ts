/**
 * AI Harness Pipeline — central orchestrator for all AI calls.
 *
 * Pipeline flow:
 *   Pre-call:  RateLimiter → PromptInjectionGuard → PromptManager
 *   Call:      AIProvider.chat() / .vision()
 *   Post-call: OutputValidator → ContentGuardrail → CallLogger
 *   Error:     FallbackHandler → CallLogger
 *
 * Business code NEVER calls AIProvider directly.
 * See docs/adr/001-ai-harness-pipeline.md
 */

import type { AIProvider } from "../types";
import type { AIHarnessRequest, AIHarnessResult } from "./types";
import { checkRateLimit } from "./rate-limiter";
import { checkInjection, sanitizeInput } from "./prompt-injection-guard";
import { validateOutput } from "./output-validator";
import { checkContentSafety } from "./content-guardrail";
import { logAICall } from "./call-logger";
import { getFallbackResult } from "./fallback-handler";

/**
 * Execute an AI operation through the full Harness pipeline.
 */
export async function executeOperation<T>(
  provider: AIProvider,
  request: AIHarnessRequest<T>
): Promise<AIHarnessResult<T>> {
  const { operation, prompt, variables, context, options } = request;
  const startTime = Date.now();

  // --- Pre-call: Rate Limiter ---
  try {
    const rateResult = await checkRateLimit(context.userId);
    if (!rateResult.allowed) {
      const result: AIHarnessResult<T> = {
        success: false,
        error: {
          message: "Rate limit exceeded",
          code: "RATE_LIMIT_EXCEEDED",
          retryable: false,
        },
        durationMs: Date.now() - startTime,
      };
      await logAICall({
        userId: context.userId,
        operationType: operation.name,
        provider: provider.config.provider,
        model: provider.config.model,
        correlationId: context.correlationId,
        promptVersion: prompt.version,
        usage: { inputTokens: 0, outputTokens: 0 },
        durationMs: result.durationMs!,
        success: false,
        errorMessage: "Rate limit exceeded",
      });
      return result;
    }
  } catch (e) {
    // Rate limiter failure is non-fatal — continue without limiting
    console.warn("[harness] Rate limiter error, continuing:", e);
  }

  // --- Pre-call: Prompt Injection Guard ---
  // Check all string variables for injection
  for (const [key, value] of Object.entries(variables)) {
    if (typeof value === "string" && value.length > 0) {
      const injectionCheck = checkInjection(value);
      if (!injectionCheck.safe) {
        const result: AIHarnessResult<T> = {
          success: false,
          error: {
            message: injectionCheck.reason || "Input rejected",
            code: "INJECTION_DETECTED",
            retryable: false,
          },
          durationMs: Date.now() - startTime,
        };
        await logAICall({
          userId: context.userId,
          operationType: operation.name,
          provider: provider.config.provider,
          model: provider.config.model,
          correlationId: context.correlationId,
          promptVersion: prompt.version,
          usage: { inputTokens: 0, outputTokens: 0 },
          durationMs: result.durationMs!,
          success: false,
          errorMessage: `Injection detected in variable "${key}": ${injectionCheck.reason}`,
        });
        return result;
      }
      // Sanitize the input
      variables[key] = sanitizeInput(value);
    }
  }

  // --- Pre-call: Build Prompt ---
  const messages = prompt.build(variables);
  const callOptions = { ...prompt.defaultOptions, ...options };

  // --- Call AIProvider ---
  try {
    const callFn = operation.usesVision ? provider.vision : provider.chat;
    const response = await callFn.call(provider, messages, callOptions);
    const durationMs = Date.now() - startTime;

    // --- Post-call: Output Validation ---
    const validation = validateOutput(response.content, operation.outputSchema);

    if (!validation.success) {
      // Validation failure — log and return error (retryable for BullMQ)
      await logAICall({
        userId: context.userId,
        operationType: operation.name,
        provider: provider.config.provider,
        model: provider.config.model,
        correlationId: context.correlationId,
        promptVersion: prompt.version,
        usage: response.usage,
        durationMs,
        success: false,
        errorMessage: `Output validation failed: ${validation.error}`,
      });

      return {
        success: false,
        error: {
          message: validation.error,
          code: "OUTPUT_VALIDATION_FAILED",
          retryable: true, // BullMQ can retry
        },
        usage: response.usage,
        durationMs,
      };
    }

    // --- Post-call: Content Guardrail (K-12 safety) ---
    const guardrailCheck = checkContentSafety(response.content);
    if (!guardrailCheck.safe) {
      await logAICall({
        userId: context.userId,
        operationType: operation.name,
        provider: provider.config.provider,
        model: provider.config.model,
        correlationId: context.correlationId,
        promptVersion: prompt.version,
        usage: response.usage,
        durationMs,
        success: false,
        errorMessage: `Content guardrail: ${guardrailCheck.reason}`,
      });

      return {
        success: false,
        error: {
          message: guardrailCheck.reason || "Content blocked by safety filter",
          code: "CONTENT_GUARDRAIL_BLOCKED",
          retryable: false,
        },
        usage: response.usage,
        durationMs,
      };
    }

    // --- Success ---
    await logAICall({
      userId: context.userId,
      operationType: operation.name,
      provider: provider.config.provider,
      model: provider.config.model,
      correlationId: context.correlationId,
      promptVersion: prompt.version,
      usage: response.usage,
      durationMs,
      success: true,
    });

    return {
      success: true,
      data: validation.data,
      usage: response.usage,
      durationMs,
    };
  } catch (e) {
    const durationMs = Date.now() - startTime;
    const errorMsg = e instanceof Error ? e.message : String(e);

    // Log the error
    await logAICall({
      userId: context.userId,
      operationType: operation.name,
      provider: provider.config.provider,
      model: provider.config.model,
      correlationId: context.correlationId,
      promptVersion: prompt.version,
      usage: { inputTokens: 0, outputTokens: 0 },
      durationMs,
      success: false,
      errorMessage: errorMsg,
    });

    // Return retryable error (BullMQ will decide to retry)
    return {
      success: false,
      error: {
        message: errorMsg,
        code: "AI_CALL_FAILED",
        retryable: true,
      },
      durationMs,
    };
  }
}
