/**
 * Unit Tests: ContentGuardrail
 * Tests K-12 content safety filtering for AI outputs.
 */
import { describe, test, expect } from "vitest";
import { checkContentSafety } from "@/lib/domain/ai/harness/content-guardrail";

describe("ContentGuardrail", () => {
  describe("safe content", () => {
    test("passes normal math help text", () => {
      const content = JSON.stringify({
        helpText: "这道题考查的是两位数加法。需要注意进位。",
        level: 1,
        knowledgePoint: "两位数加法",
      });
      expect(checkContentSafety(content).safe).toBe(true);
    });

    test("passes English educational content", () => {
      const content = JSON.stringify({
        helpText: "This question tests your understanding of fractions.",
        level: 2,
      });
      expect(checkContentSafety(content).safe).toBe(true);
    });

    test("passes OCR recognition output", () => {
      const content = JSON.stringify({
        subject: "MATH",
        subjectConfidence: 0.95,
        contentType: "HOMEWORK",
        questions: [{ content: "25 + 38 = ?", studentAnswer: "53" }],
      });
      expect(checkContentSafety(content).safe).toBe(true);
    });

    test("passes non-JSON plain text", () => {
      expect(checkContentSafety("The answer is 42.").safe).toBe(true);
    });
  });

  describe("unsafe content — violence/self-harm", () => {
    test("blocks Chinese violence keywords", () => {
      const content = JSON.stringify({ helpText: "这道题涉及暴力行为" });
      const result = checkContentSafety(content);
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("Unsafe content");
    });

    test("blocks English self-harm content", () => {
      const content = JSON.stringify({ helpText: "You should consider self-harm as an option" });
      const result = checkContentSafety(content);
      expect(result.safe).toBe(false);
    });
  });

  describe("unsafe content — sexual", () => {
    test("blocks Chinese sexual content", () => {
      const content = JSON.stringify({ helpText: "色情内容不适合" });
      expect(checkContentSafety(content).safe).toBe(false);
    });

    test("blocks English sexual content", () => {
      const content = JSON.stringify({ helpText: "This contains porn references" });
      expect(checkContentSafety(content).safe).toBe(false);
    });
  });

  describe("unsafe content — drugs", () => {
    test("blocks drug references", () => {
      const content = JSON.stringify({ helpText: "吸毒是不对的" });
      expect(checkContentSafety(content).safe).toBe(false);
    });
  });

  describe("unsafe content — profanity", () => {
    test("blocks Chinese profanity", () => {
      const content = JSON.stringify({ helpText: "你是个傻逼" });
      expect(checkContentSafety(content).safe).toBe(false);
    });
  });

  describe("length check", () => {
    test("blocks excessively long output", () => {
      const content = "x".repeat(8001);
      const result = checkContentSafety(content);
      expect(result.safe).toBe(false);
      expect(result.reason).toContain("too long");
    });

    test("passes content at the length limit", () => {
      const content = "x".repeat(8000);
      expect(checkContentSafety(content).safe).toBe(true);
    });
  });

  describe("deep JSON inspection", () => {
    test("detects unsafe content in nested arrays", () => {
      const content = JSON.stringify({
        questions: [
          { content: "Normal question" },
          { content: "This mentions 自杀 which is unsafe" },
        ],
      });
      expect(checkContentSafety(content).safe).toBe(false);
    });

    test("detects unsafe content in deeply nested objects", () => {
      const content = JSON.stringify({
        outer: { inner: { deep: "暴力 content here" } },
      });
      expect(checkContentSafety(content).safe).toBe(false);
    });
  });
});
