/**
 * Unit Tests: Subject-Detect Operation
 * Tests schema validation and prompt building.
 */
import { describe, test, expect } from "vitest";
import { subjectDetectSchema } from "@/lib/ai/harness/schemas/subject-detect";
import { subjectDetectPrompt } from "@/lib/ai/prompts/subject-detect";

describe("subjectDetectSchema", () => {
  test("validates math detection with high confidence", () => {
    const result = subjectDetectSchema.safeParse({
      subject: "MATH",
      confidence: 0.95,
      contentType: "HOMEWORK",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subject).toBe("MATH");
      expect(result.data.confidence).toBe(0.95);
      expect(result.data.contentType).toBe("HOMEWORK");
    }
  });

  test("validates detection without contentType", () => {
    const result = subjectDetectSchema.safeParse({
      subject: "ENGLISH",
      confidence: 0.8,
    });
    expect(result.success).toBe(true);
  });

  test("validates all subject values", () => {
    const subjects = [
      "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
      "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
    ];
    for (const subject of subjects) {
      const result = subjectDetectSchema.safeParse({ subject, confidence: 0.9 });
      expect(result.success).toBe(true);
    }
  });

  test("rejects invalid subject", () => {
    expect(
      subjectDetectSchema.safeParse({ subject: "SCIENCE", confidence: 0.9 }).success
    ).toBe(false);
  });

  test("rejects confidence out of range", () => {
    expect(
      subjectDetectSchema.safeParse({ subject: "MATH", confidence: 1.5 }).success
    ).toBe(false);
    expect(
      subjectDetectSchema.safeParse({ subject: "MATH", confidence: -0.1 }).success
    ).toBe(false);
  });

  test("validates all contentType values", () => {
    const types = [
      "EXAM", "HOMEWORK", "DICTATION", "COPYWRITING",
      "ORAL_CALC", "COMPOSITION", "OTHER",
    ];
    for (const contentType of types) {
      const result = subjectDetectSchema.safeParse({
        subject: "MATH",
        confidence: 0.8,
        contentType,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe("subjectDetectPrompt", () => {
  test("builds prompt with question content", () => {
    const messages = subjectDetectPrompt.build({
      questionContent: "求方程 2x + 5 = 15 的解",
      locale: "zh",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");

    const userContent = messages[1].content as string;
    expect(userContent).toContain("2x + 5 = 15");
  });

  test("includes student answer when provided", () => {
    const messages = subjectDetectPrompt.build({
      questionContent: "What is photosynthesis?",
      studentAnswer: "Plants make food from sunlight",
      locale: "en",
    });

    const userContent = messages[1].content as string;
    expect(userContent).toContain("Student's answer:");
    expect(userContent).toContain("Plants make food");
  });

  test("omits student answer line when empty", () => {
    const messages = subjectDetectPrompt.build({
      questionContent: "求解方程",
      studentAnswer: "",
      locale: "zh",
    });

    const userContent = messages[1].content as string;
    expect(userContent).not.toContain("Student's answer:");
  });

  test("system prompt contains all valid subjects", () => {
    const messages = subjectDetectPrompt.build({
      questionContent: "test",
      locale: "zh",
    });

    const sysContent = messages[0].content as string;
    expect(sysContent).toContain("MATH");
    expect(sysContent).toContain("CHINESE");
    expect(sysContent).toContain("PHYSICS");
    expect(sysContent).toContain("OTHER");
  });

  test("has low-token default options for fast classification", () => {
    expect(subjectDetectPrompt.defaultOptions?.maxTokens).toBe(64);
    expect(subjectDetectPrompt.defaultOptions?.temperature).toBe(0.1);
    expect(subjectDetectPrompt.defaultOptions?.responseFormat).toBe("json_object");
  });
});
