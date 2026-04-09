/**
 * Unit Tests: AI Provider abstraction layer
 * Tests types, factory, and mock provider behavior.
 */
import { describe, test, expect, vi } from "vitest";
import { MockAIProvider } from "../helpers/mock-ai-provider";
import type { AIMessage, AIResponse, AIUsage } from "@/lib/ai/types";

describe("AIProvider Interface", () => {
  test("MockAIProvider implements chat method", async () => {
    const provider = new MockAIProvider();
    const messages: AIMessage[] = [
      { role: "system", content: "You are a math tutor." },
      { role: "user", content: "What is 2+2?" },
    ];

    const response = await provider.chat(messages);

    expect(response.content).toBe('{"mock": true}');
    expect(response.usage.inputTokens).toBe(100);
    expect(response.usage.outputTokens).toBe(50);
    expect(response.model).toBe("mock-model");
    expect(response.finishReason).toBe("stop");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].messages).toEqual(messages);
  });

  test("MockAIProvider implements vision method", async () => {
    const provider = new MockAIProvider();
    const messages: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this image" },
          { type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } },
        ],
      },
    ];

    const response = await provider.vision(messages);

    expect(response.content).toBeTruthy();
    expect(provider.calls).toHaveLength(1);
  });

  test("MockAIProvider can be configured to throw errors", async () => {
    const provider = new MockAIProvider();
    provider.shouldThrow = new Error("API rate limited");

    await expect(provider.chat([{ role: "user", content: "hello" }])).rejects.toThrow(
      "API rate limited"
    );
  });

  test("MockAIProvider can return custom responses", async () => {
    const provider = new MockAIProvider();
    provider.nextResponse = {
      content: JSON.stringify({ questions: [{ id: 1, content: "2+2=?" }] }),
      usage: { inputTokens: 200, outputTokens: 150 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    const response = await provider.chat([{ role: "user", content: "test" }]);
    const parsed = JSON.parse(response.content);
    expect(parsed.questions).toHaveLength(1);
    expect(response.usage.inputTokens).toBe(200);
  });

  test("MockAIProvider records call options", async () => {
    const provider = new MockAIProvider();
    await provider.chat([{ role: "user", content: "test" }], {
      maxTokens: 2048,
      temperature: 0.1,
      responseFormat: "json_object",
    });

    expect(provider.calls[0].options?.maxTokens).toBe(2048);
    expect(provider.calls[0].options?.temperature).toBe(0.1);
    expect(provider.calls[0].options?.responseFormat).toBe("json_object");
  });

  test("MockAIProvider reset clears state", async () => {
    const provider = new MockAIProvider();
    await provider.chat([{ role: "user", content: "test" }]);
    expect(provider.calls).toHaveLength(1);

    provider.reset();
    expect(provider.calls).toHaveLength(0);
    expect(provider.shouldThrow).toBeNull();
  });
});

describe("AIProvider Config", () => {
  test("provider exposes config with provider name and model", () => {
    const provider = new MockAIProvider();
    expect(provider.config.provider).toBe("mock");
    expect(provider.config.model).toBe("mock-model");
  });
});

describe("AIResponse type contract", () => {
  test("response contains all required fields", () => {
    const response: AIResponse = {
      content: "test content",
      usage: { inputTokens: 10, outputTokens: 5 },
      model: "test-model",
      finishReason: "stop",
    };

    expect(response.content).toBe("test content");
    expect(response.usage.inputTokens).toBeGreaterThanOrEqual(0);
    expect(response.usage.outputTokens).toBeGreaterThanOrEqual(0);
    expect(response.model).toBeTruthy();
  });

  test("usage tracks token counts", () => {
    const usage: AIUsage = { inputTokens: 500, outputTokens: 200 };
    expect(usage.inputTokens + usage.outputTokens).toBe(700);
  });
});

describe("Provider Factory", () => {
  test("unknown provider throws error", async () => {
    vi.stubEnv("AI_PROVIDER", "unknown");
    // Dynamic import to pick up env change
    const { createAIProvider } = await import("@/lib/ai/provider-factory");
    expect(() => createAIProvider()).toThrow("Unknown AI provider: unknown");
    vi.unstubAllEnvs();
  });
});
