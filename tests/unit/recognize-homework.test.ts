/**
 * Unit Tests: recognizeHomework Operation
 * Tests the operation orchestration with mocked provider and harness.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock DB
vi.mock("@/lib/db", () => ({
  db: { aICallLog: { create: vi.fn().mockResolvedValue({}) } },
}));

// Mock Redis
vi.mock("@/lib/redis", () => ({
  redis: {
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    zrange: vi.fn().mockResolvedValue([]),
  },
}));

// Mock AI provider
import { MockAIProvider } from "../helpers/mock-ai-provider";
const mockProvider = new MockAIProvider();
vi.mock("@/lib/ai/singleton", () => ({
  getAIProvider: () => mockProvider,
}));

import { recognizeHomework } from "@/lib/ai/operations/recognize-homework";

beforeEach(() => {
  mockProvider.reset();
});

const validOCRResponse = JSON.stringify({
  subject: "MATH",
  subjectConfidence: 0.95,
  contentType: "HOMEWORK",
  grade: "PRIMARY_3",
  title: "Math Homework",
  questions: [
    {
      questionNumber: 1,
      questionType: "CALCULATION",
      content: "25 + 38 = ?",
      studentAnswer: "63",
      correctAnswer: "63",
      isCorrect: true,
      confidence: 0.92,
      knowledgePoint: "两位数加法",
    },
    {
      questionNumber: 2,
      questionType: "CALCULATION",
      content: "45 - 17 = ?",
      studentAnswer: "28",
      correctAnswer: "28",
      isCorrect: true,
      confidence: 0.88,
      knowledgePoint: "两位数减法",
    },
  ],
  totalScore: 100,
  correctCount: 2,
});

describe("recognizeHomework", () => {
  test("returns structured data on success", async () => {
    mockProvider.nextResponse = {
      content: validOCRResponse,
      usage: { inputTokens: 800, outputTokens: 300 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    const result = await recognizeHomework({
      imageUrls: ["http://minio:9000/img1.jpg"],
      context: { userId: "student1", locale: "zh", grade: "PRIMARY_3" },
    });

    expect(result.success).toBe(true);
    expect(result.data?.subject).toBe("MATH");
    expect(result.data?.questions).toHaveLength(2);
    expect(result.data?.questions[0].isCorrect).toBe(true);
    expect(result.data?.totalScore).toBe(100);
    expect(result.usage?.inputTokens).toBe(800);
  });

  test("calls provider with vision method", async () => {
    mockProvider.nextResponse = {
      content: validOCRResponse,
      usage: { inputTokens: 500, outputTokens: 200 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    await recognizeHomework({
      imageUrls: ["http://minio:9000/img1.jpg", "http://minio:9000/img2.jpg"],
      context: { userId: "student1", locale: "zh" },
    });

    expect(mockProvider.calls).toHaveLength(1);
    // Messages should contain image_url content
    const messages = mockProvider.calls[0].messages;
    expect(messages.length).toBeGreaterThanOrEqual(2);
  });

  test("returns retryable error on AI failure", async () => {
    mockProvider.shouldThrow = new Error("Connection timeout");

    const result = await recognizeHomework({
      imageUrls: ["http://minio:9000/img1.jpg"],
      context: { userId: "student1", locale: "zh" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.retryable).toBe(true);
    expect(result.error?.code).toBe("AI_CALL_FAILED");
  });

  test("returns retryable error on invalid output", async () => {
    mockProvider.nextResponse = {
      content: '{"invalid": "schema"}',
      usage: { inputTokens: 300, outputTokens: 50 },
      model: "gpt-5.4",
      finishReason: "stop",
    };

    const result = await recognizeHomework({
      imageUrls: ["http://minio:9000/img1.jpg"],
      context: { userId: "student1", locale: "zh" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("OUTPUT_VALIDATION_FAILED");
    expect(result.error?.retryable).toBe(true);
  });
});
