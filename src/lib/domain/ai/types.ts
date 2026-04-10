/**
 * AI Provider abstraction layer.
 * All AI providers must implement the AIProvider interface.
 * Business code calls Operations → Harness → Provider (never directly).
 */

export interface AIMessage {
  role: "system" | "user" | "assistant";
  content: string | AIMessageContent[];
}

export interface AIMessageContent {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string; detail?: "low" | "high" | "auto" };
}

export interface AIUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AIResponse {
  content: string;
  usage: AIUsage;
  model: string;
  finishReason: string | null;
}

export interface AIProviderConfig {
  provider: string;
  model: string;
}

/**
 * Abstract AI provider interface.
 * Implementations: AzureOpenAIProvider, (future) LocalModelProvider.
 */
export interface AIProvider {
  readonly config: AIProviderConfig;

  /**
   * Text-only chat completion.
   */
  chat(messages: AIMessage[], options?: AICallOptions): Promise<AIResponse>;

  /**
   * Vision chat completion (text + images).
   */
  vision(messages: AIMessage[], options?: AICallOptions): Promise<AIResponse>;
}

export interface AICallOptions {
  /** Max output tokens. Default: 4096 */
  maxTokens?: number;
  /** Sampling temperature 0-2. Default: 0.3 */
  temperature?: number;
  /** Response format. Default: "text" */
  responseFormat?: "text" | "json_object";
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}
