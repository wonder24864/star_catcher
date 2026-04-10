import type { z } from "zod";
import type { AIOperationType } from "@prisma/client";
import type { AIMessage, AICallOptions, AIUsage } from "../types";

/**
 * Defines an AI operation that flows through the Harness pipeline.
 */
export interface AIOperation<TOutput = unknown> {
  /** Operation name matching AIOperationType enum */
  name: AIOperationType;
  /** Human-readable description for logging */
  description: string;
  /** Zod schema for validating AI output JSON */
  outputSchema: z.ZodType<TOutput>;
  /** Whether this operation uses vision (image input) */
  usesVision: boolean;
}

/**
 * Context passed through the Harness pipeline for each AI call.
 */
export interface AICallContext {
  /** User making the request */
  userId: string;
  /** Correlation ID for tracing (BullMQ jobId or request ID) */
  correlationId?: string;
  /** User locale for prompt language selection */
  locale: string;
  /** Student grade for prompt adaptation */
  grade?: string;
}

/**
 * Prompt template definition.
 */
export interface PromptTemplate {
  /** Template version for tracking */
  version: string;
  /** Build messages from input variables */
  build: (variables: Record<string, unknown>) => AIMessage[];
  /** Default call options */
  defaultOptions?: AICallOptions;
}

/**
 * Result returned by the Harness pipeline.
 */
export interface AIHarnessResult<T> {
  success: boolean;
  /** Parsed and validated output data (only if success) */
  data?: T;
  /** Error info (only if !success) */
  error?: {
    message: string;
    code: string;
    retryable: boolean;
  };
  /** True if this is a fallback/degraded result */
  fallback?: boolean;
  /** Token usage from the AI call */
  usage?: AIUsage;
  /** Duration in milliseconds */
  durationMs?: number;
}

/**
 * Request to execute an AI operation through the Harness.
 */
export interface AIHarnessRequest<TOutput = unknown> {
  operation: AIOperation<TOutput>;
  prompt: PromptTemplate;
  variables: Record<string, unknown>;
  context: AICallContext;
  options?: AICallOptions;
}
