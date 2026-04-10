import { AzureOpenAI } from "openai";
import type {
  AIProvider,
  AIProviderConfig,
  AIMessage,
  AICallOptions,
  AIResponse,
  AIMessageContent,
} from "../types";

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

/**
 * Convert our AIMessage format to OpenAI SDK format.
 */
function toOpenAIMessages(
  messages: AIMessage[]
): Array<{ role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> }> {
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    // Multi-part content (text + images)
    const parts = msg.content.map((part: AIMessageContent) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text ?? "" };
      }
      return {
        type: "image_url" as const,
        image_url: {
          url: part.image_url?.url ?? "",
          detail: part.image_url?.detail ?? "auto",
        },
      };
    });
    return { role: msg.role, content: parts };
  });
}

export class AzureOpenAIProvider implements AIProvider {
  readonly config: AIProviderConfig;
  private client: AzureOpenAI;
  private deployment: string;

  constructor() {
    validateAzureEnv();

    this.deployment = process.env.AZURE_OPENAI_DEPLOYMENT!;
    this.config = {
      provider: "azure",
      model: this.deployment,
    };

    this.client = new AzureOpenAI({
      apiKey: process.env.AZURE_OPENAI_API_KEY!,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
    });
  }

  async chat(messages: AIMessage[], options?: AICallOptions): Promise<AIResponse> {
    return this.complete(messages, options);
  }

  async vision(messages: AIMessage[], options?: AICallOptions): Promise<AIResponse> {
    // Azure OpenAI GPT-5.4 handles vision natively in the same endpoint
    return this.complete(messages, options);
  }

  private async complete(
    messages: AIMessage[],
    options?: AICallOptions
  ): Promise<AIResponse> {
    const response = await this.client.chat.completions.create(
      {
        model: this.deployment,
        messages: toOpenAIMessages(messages) as Parameters<typeof this.client.chat.completions.create>[0]["messages"],
        max_completion_tokens: options?.maxTokens ?? 4096,
        temperature: options?.temperature ?? 0.3,
        response_format: options?.responseFormat === "json_object"
          ? { type: "json_object" }
          : undefined,
      },
      { signal: options?.signal }
    );

    const choice = response.choices[0];
    const usage = response.usage;

    return {
      content: choice?.message?.content ?? "",
      usage: {
        inputTokens: usage?.prompt_tokens ?? 0,
        outputTokens: usage?.completion_tokens ?? 0,
      },
      model: response.model ?? this.deployment,
      finishReason: choice?.finish_reason ?? null,
    };
  }
}
