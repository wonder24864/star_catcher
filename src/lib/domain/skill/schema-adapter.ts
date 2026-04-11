/**
 * Schema Adapter — Canonical JSON Schema → Provider-specific function call format.
 *
 * The Canonical format (schema.json) is provider-agnostic. This adapter
 * converts at runtime based on the target AI provider, enabling transparent
 * provider switching without modifying Skill definitions.
 *
 * Supported providers:
 *   - openai:     OpenAI Chat Completions function calling format
 *   - anthropic:  Anthropic Claude tool use format
 *   - ollama:     Ollama (OpenAI-compatible) format
 *
 * See: docs/adr/008-agent-architecture.md
 */
import type { CanonicalSkillSchema } from "./bundle";

// ─── Provider Types ───────────────────────────────

export type SupportedProvider = "openai" | "anthropic" | "ollama";

/** OpenAI function tool format */
export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
  };
}

/** Anthropic Claude tool format */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Ollama uses OpenAI-compatible format */
export type OllamaFunctionTool = OpenAIFunctionTool;

/** Union of all provider tool formats */
export type ProviderTool = OpenAIFunctionTool | AnthropicTool;

// ─── Single Schema Adaptation ─────────────────────

/**
 * Convert a Canonical JSON Schema to provider-specific function call format.
 */
export function adaptSchema(
  schema: CanonicalSkillSchema,
  provider: SupportedProvider,
): ProviderTool {
  switch (provider) {
    case "openai":
      return toOpenAI(schema);
    case "anthropic":
      return toAnthropic(schema);
    case "ollama":
      return toOllama(schema);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Convert multiple Canonical schemas to provider-specific format.
 * Used by Agent Runner to provide all available skill tools to the AI.
 */
export function adaptSchemas(
  schemas: CanonicalSkillSchema[],
  provider: SupportedProvider,
): ProviderTool[] {
  return schemas.map((s) => adaptSchema(s, provider));
}

// ─── Provider Converters ──────────────────────────

function toOpenAI(schema: CanonicalSkillSchema): OpenAIFunctionTool {
  return {
    type: "function",
    function: {
      name: schema.name,
      description: schema.description,
      parameters: {
        ...schema.parameters,
        // OpenAI recommends additionalProperties: false for strict mode
        additionalProperties: false,
      },
      strict: true,
    },
  };
}

function toAnthropic(schema: CanonicalSkillSchema): AnthropicTool {
  return {
    name: schema.name,
    description: schema.description,
    input_schema: {
      ...schema.parameters,
    },
  };
}

function toOllama(schema: CanonicalSkillSchema): OllamaFunctionTool {
  // Ollama uses OpenAI-compatible format but without strict mode
  return {
    type: "function",
    function: {
      name: schema.name,
      description: schema.description,
      parameters: { ...schema.parameters },
    },
  };
}
