/**
 * Agent Runner — Type Definitions
 *
 * Defines Agent declarations (system prompt, allowed skills, termination
 * conditions) and the runtime types used by the Agent Runner loop.
 *
 * See: docs/adr/008-agent-architecture.md §4–§5
 */
import type { AIUsage } from "../ai/types";
import type { SkillExecutionContext } from "../skill/types";

// ─── Agent Definition (code-level, not DB) ───────

/** Static declaration of an Agent's capabilities and constraints. */
export interface AgentDefinition {
  /** Unique agent name (e.g. "homework-checker") */
  name: string;
  /** System prompt: role + task + constraints */
  systemPrompt: string;
  /** Skill names this agent is allowed to call */
  allowedSkills: string[];
  /** Termination conditions — Agent Runner enforces these */
  termination: AgentTerminationConfig;
  /** AI model parameters (optional) */
  modelConfig?: AgentModelConfig;
}

export interface AgentTerminationConfig {
  /** Hard upper limit on function-call steps (ADR-008: ≤ 10) */
  maxSteps: number;
  /** Token budget (input + output combined) */
  maxTokens: number;
  /** Natural-language stop criteria included in system prompt */
  stopCriteria: string;
}

/** AI call parameters for Agent Runner */
export interface AgentModelConfig {
  /** Sampling temperature (default: 0.3) */
  temperature?: number;
  /** Max output tokens per single AI call (not to be confused with AgentTerminationConfig.maxTokens which is the total budget) */
  maxOutputTokens?: number;
}

// ─── Agent Runner Runtime ────────────────────────

/** A single step in the Agent execution loop */
export interface AgentStep {
  stepNo: number;
  skillName: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  tokensUsed: AIUsage;
  status: "SUCCESS" | "FAILED" | "TIMEOUT";
  errorMessage?: string;
}

/** Why the agent loop terminated */
export type AgentTerminationReason =
  | "COMPLETED"    // AI decided to stop (no more function calls)
  | "MAX_STEPS"    // Hit maxSteps limit
  | "MAX_TOKENS"   // Hit token budget
  | "ERROR"        // Unrecoverable error
  | "SKILL_ALL_FAILED"; // All skill calls in a step failed

/** Final result of an Agent run */
export interface AgentRunResult {
  agentName: string;
  status: "COMPLETED" | "TERMINATED" | "FAILED";
  terminationReason: AgentTerminationReason;
  steps: AgentStep[];
  totalSteps: number;
  totalTokens: AIUsage;
  totalDurationMs: number;
  /** Final text response from the AI (last assistant message) */
  finalResponse: string;
}

/** Context for an Agent run */
export interface AgentRunContext extends SkillExecutionContext {
  /** User ID for rate limiting / logging */
  userId: string;
  /** Correlation ID for tracing */
  correlationId?: string;
}

// ─── AI Provider Adapter (function calling) ──────

/**
 * Provider-specific message with possible function calls.
 * Agent Runner uses this to parse AI responses that may contain tool calls.
 */
export interface FunctionCallingMessage {
  role: "assistant";
  content: string | null;
  /** Tool/function calls the AI wants to make */
  toolCalls?: FunctionCallRequest[];
}

export interface FunctionCallRequest {
  /** Provider-assigned call ID (for matching results) */
  id: string;
  /** Function name */
  name: string;
  /** JSON-encoded arguments */
  arguments: string;
}

/**
 * AI provider interface extended for function calling.
 * Agent Runner requires this capability to operate.
 */
export interface FunctionCallingProvider {
  /**
   * Chat completion with function calling support.
   * Returns structured message that may include tool_calls.
   */
  chatWithTools(
    messages: FunctionCallingProviderMessage[],
    tools: unknown[],
    options?: FunctionCallingOptions,
  ): Promise<FunctionCallingResponse>;
}

export interface FunctionCallingProviderMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  /** For assistant messages with tool calls */
  toolCalls?: FunctionCallRequest[];
  /** For tool result messages */
  toolCallId?: string;
  name?: string;
}

export interface FunctionCallingOptions {
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface FunctionCallingResponse {
  message: FunctionCallingMessage;
  usage: AIUsage;
  model: string;
  finishReason: string | null;
}
