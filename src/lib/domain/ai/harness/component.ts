/**
 * HarnessComponent interface + HarnessContext — the building blocks
 * of the Harness component pipeline.
 *
 * Each component does one thing, the pipeline orchestrates execution order.
 * See: docs/sprints/sprint-10a.md (Task 91b)
 */

import type { AIProvider, AIMessage, AICallOptions, AIResponse, AIUsage } from "../types";
import type { AIHarnessRequest, AIHarnessResult } from "./types";

// ────────────────────── Component Interface ──────────────────────

export interface HarnessComponent {
  readonly name: string;
  execute(ctx: HarnessContext): Promise<void>;
}

// ────────────────────── Pipeline Context ──────────────────────

export interface HarnessContext {
  readonly provider: AIProvider;
  readonly request: AIHarnessRequest<unknown>;
  readonly startTime: number;

  /** Prompt messages built by PromptManagerComponent */
  messages: AIMessage[];
  /** Call options merged from prompt defaults + request overrides */
  callOptions: AICallOptions;
  /** Raw AI response from AICallComponent */
  response?: AIResponse;
  /** Parsed + validated data from OutputValidatorComponent */
  validatedData?: unknown;

  /** Set to true when a component short-circuits the pipeline */
  completed: boolean;
  /** Final result (set by succeed/fail) */
  result?: AIHarnessResult<unknown>;

  /** Semantic cache fields */
  cacheHit: boolean;
  cacheId?: string;
  /** Computed prompt hash (set by SemanticCacheCheck for SemanticCacheStore) */
  promptHash?: string;
  /** Serialized prompt text (set by SemanticCacheCheck for SemanticCacheStore) */
  promptText?: string;

  /** Mark pipeline as failed and short-circuit */
  fail(message: string, code: string, retryable: boolean): void;
  /** Mark pipeline as succeeded with validated data */
  succeed(data: unknown): void;
  /** Get the final result (call after pipeline completes) */
  getResult<T>(): AIHarnessResult<T>;
  /** Attributes for OTel spans */
  spanAttributes(): Record<string, string | number | boolean>;
}

// ────────────────────── Context Implementation ──────────────────────

export function createContext(
  provider: AIProvider,
  request: AIHarnessRequest<unknown>,
): HarnessContext {
  const startTime = Date.now();

  const ctx: HarnessContext = {
    provider,
    request,
    startTime,
    messages: [],
    callOptions: {},
    completed: false,
    cacheHit: false,

    fail(message: string, code: string, retryable: boolean) {
      ctx.completed = true;
      ctx.result = {
        success: false,
        error: { message, code, retryable },
        usage: ctx.response?.usage,
        durationMs: Date.now() - startTime,
      };
    },

    succeed(data: unknown) {
      ctx.completed = true;
      ctx.result = {
        success: true,
        data,
        usage: ctx.response?.usage,
        durationMs: Date.now() - startTime,
        cacheHit: ctx.cacheHit || undefined,
        cacheId: ctx.cacheId,
      };
    },

    getResult<T>(): AIHarnessResult<T> {
      if (ctx.result) {
        return { ...ctx.result, durationMs: Date.now() - startTime } as AIHarnessResult<T>;
      }
      // Should not happen — pipeline always calls succeed/fail
      return {
        success: false,
        error: { message: "Pipeline completed without result", code: "PIPELINE_ERROR", retryable: false },
        durationMs: Date.now() - startTime,
      };
    },

    spanAttributes() {
      return {
        "harness.operation": request.operation.name,
        "harness.userId": request.context.userId,
        "harness.cacheHit": ctx.cacheHit,
      };
    },
  };

  return ctx;
}
