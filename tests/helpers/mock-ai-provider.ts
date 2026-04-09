/**
 * Mock AIProvider for unit testing.
 * Records calls for assertions and returns configurable responses.
 */
import type { AIProvider, AIProviderConfig, AIMessage, AICallOptions, AIResponse } from "@/lib/ai/types";

export interface MockAICall {
  messages: AIMessage[];
  options?: AICallOptions;
}

export class MockAIProvider implements AIProvider {
  readonly config: AIProviderConfig = { provider: "mock", model: "mock-model" };

  calls: MockAICall[] = [];
  nextResponse: AIResponse = {
    content: '{"mock": true}',
    usage: { inputTokens: 100, outputTokens: 50 },
    model: "mock-model",
    finishReason: "stop",
  };
  shouldThrow: Error | null = null;

  async chat(messages: AIMessage[], options?: AICallOptions): Promise<AIResponse> {
    this.calls.push({ messages, options });
    if (this.shouldThrow) throw this.shouldThrow;
    return this.nextResponse;
  }

  async vision(messages: AIMessage[], options?: AICallOptions): Promise<AIResponse> {
    this.calls.push({ messages, options });
    if (this.shouldThrow) throw this.shouldThrow;
    return this.nextResponse;
  }

  reset() {
    this.calls = [];
    this.shouldThrow = null;
    this.nextResponse = {
      content: '{"mock": true}',
      usage: { inputTokens: 100, outputTokens: 50 },
      model: "mock-model",
      finishReason: "stop",
    };
  }
}
