/**
 * FunctionCallingProvider adapter for Azure OpenAI.
 *
 * Wraps the OpenAI SDK's tool-calling API to implement the
 * FunctionCallingProvider interface used by Agent Runner.
 *
 * See: docs/adr/008-agent-architecture.md §5
 */
import { AzureOpenAI } from "openai";
import type {
  FunctionCallingProvider,
  FunctionCallingProviderMessage,
  FunctionCallingOptions,
  FunctionCallingResponse,
  FunctionCallRequest,
} from "../../agent/types";

/**
 * Convert FunctionCallingProviderMessage[] to OpenAI SDK message format.
 */
function toOpenAIMessages(
  messages: FunctionCallingProviderMessage[],
): Parameters<AzureOpenAI["chat"]["completions"]["create"]>[0]["messages"] {
  return messages.map((msg) => {
    if (msg.role === "system") {
      return { role: "system" as const, content: msg.content ?? "" };
    }
    if (msg.role === "user") {
      return { role: "user" as const, content: msg.content ?? "" };
    }
    if (msg.role === "tool") {
      return {
        role: "tool" as const,
        content: msg.content ?? "",
        tool_call_id: msg.toolCallId ?? "",
      };
    }
    // assistant — may have tool_calls
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      return {
        role: "assistant" as const,
        content: msg.content ?? null,
        tool_calls: msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
    }
    return { role: "assistant" as const, content: msg.content ?? "" };
  });
}

/**
 * AzureOpenAI adapter implementing FunctionCallingProvider
 * for the Agent Runner function-calling loop.
 */
function validateAzureEnv() {
  const required = [
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing Azure OpenAI env vars: ${missing.join(", ")}`);
  }
}

export class AzureOpenAIFunctionCallingProvider
  implements FunctionCallingProvider
{
  private client: AzureOpenAI;
  private deployment: string;

  constructor() {
    validateAzureEnv();
    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
    this.client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiVersion:
        process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
    });
  }

  async chatWithTools(
    messages: FunctionCallingProviderMessage[],
    tools: unknown[],
    options?: FunctionCallingOptions,
  ): Promise<FunctionCallingResponse> {
    const response = await this.client.chat.completions.create(
      {
        model: this.deployment,
        messages: toOpenAIMessages(messages),
        tools: tools as Parameters<
          typeof this.client.chat.completions.create
        >[0]["tools"],
        max_completion_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.3,
      },
      { signal: options?.signal },
    );

    const choice = response.choices[0];
    const usage = response.usage;

    // Parse tool_calls from response (filter to function type only)
    const toolCalls: FunctionCallRequest[] =
      choice?.message?.tool_calls
        ?.filter((tc): tc is typeof tc & { type: "function" } =>
          tc.type === "function",
        )
        .map((tc) => ({
          id: tc.id,
          name: (tc as { function: { name: string; arguments: string } }).function.name,
          arguments: (tc as { function: { name: string; arguments: string } }).function.arguments,
        })) ?? [];

    return {
      message: {
        role: "assistant",
        content: choice?.message?.content ?? null,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
      model: response.model ?? this.deployment,
      finishReason: choice?.finish_reason ?? null,
    };
  }
}
