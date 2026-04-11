/**
 * Unit Tests: gradeAnswer Operation
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/infra/db", () => ({
  db: { aICallLog: { create: vi.fn().mockResolvedValue({}) } },
}));

vi.mock("@/lib/infra/redis", () => ({
  redis: {
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    zrange: vi.fn().mockResolvedValue([]),
  },
}));

import { MockAIProvider } from "../helpers/mock-ai-provider";
const mockProvider = new MockAIProvider();
vi.mock("@/lib/domain/ai/singleton", () => ({
  getAIProvider: () => mockProvider,
}));

import { gradeAnswer } from "@/lib/domain/ai/operations/grade-answer";

beforeEach(() => {
  mockProvider.reset();
});

const ctx = { userId: "student1", locale: "zh", grade: "PRIMARY_3" };

describe("gradeAnswer", () => {
  test("returns isCorrect=true on correct answer", async () => {
    mockProvider.nextResponse = {
      content: JSON.stringify({ isCorrect: true, confidence: 0.95 }),
      usage: { inputTokens: 100, outputTokens: 20 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    const result = await gradeAnswer({
      questionContent: "25 + 38 = ?",
      studentAnswer: "63",
      correctAnswer: "63",
      subject: "MATH",
      context: ctx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.isCorrect).toBe(true);
    expect(result.data?.confidence).toBe(0.95);
  });

  test("returns isCorrect=false on wrong answer", async () => {
    mockProvider.nextResponse = {
      content: JSON.stringify({ isCorrect: false, confidence: 0.98 }),
      usage: { inputTokens: 100, outputTokens: 20 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    const result = await gradeAnswer({
      questionContent: "25 + 38 = ?",
      studentAnswer: "60",
      correctAnswer: "63",
      context: ctx,
    });

    expect(result.success).toBe(true);
    expect(result.data?.isCorrect).toBe(false);
  });

  test("returns retryable error on AI failure", async () => {
    mockProvider.shouldThrow = new Error("Timeout");

    const result = await gradeAnswer({
      questionContent: "25 + 38 = ?",
      studentAnswer: "63",
      context: ctx,
    });

    expect(result.success).toBe(false);
    expect(result.error?.retryable).toBe(true);
  });

  test("returns error on invalid schema output", async () => {
    mockProvider.nextResponse = {
      content: '{"wrong": "schema"}',
      usage: { inputTokens: 50, outputTokens: 10 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    const result = await gradeAnswer({
      questionContent: "Q",
      studentAnswer: "A",
      context: ctx,
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("OUTPUT_VALIDATION_FAILED");
  });

  test("uses text (non-vision) mode", async () => {
    mockProvider.nextResponse = {
      content: JSON.stringify({ isCorrect: true, confidence: 0.9 }),
      usage: { inputTokens: 80, outputTokens: 15 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    await gradeAnswer({ questionContent: "Q", studentAnswer: "A", context: ctx });

    // MockAIProvider records which method was called; chat = non-vision
    expect(mockProvider.calls).toHaveLength(1);
    // The provider should have been called via chat (no image_url in messages)
    const messages = mockProvider.calls[0].messages;
    const hasImageUrl = messages.some((m) =>
      Array.isArray(m.content) &&
      m.content.some((c) => c.type === "image_url")
    );
    expect(hasImageUrl).toBe(false);
  });
});
