/**
 * Unit Tests: Help-Generate Operation
 * Tests schema validation, prompt building, and operation wiring.
 */
import { describe, test, expect } from "vitest";
import { helpGenerateSchema } from "@/lib/domain/ai/harness/schemas/help-generate";
import { helpGeneratePrompt } from "@/lib/domain/ai/prompts/help-generate";

describe("helpGenerateSchema", () => {
  test("validates Level 1 output", () => {
    const result = helpGenerateSchema.safeParse({
      helpText: "这道题考查两位数加法，注意进位。",
      level: 1,
      knowledgePoint: "两位数加法",
    });
    expect(result.success).toBe(true);
  });

  test("validates Level 2 output", () => {
    const result = helpGenerateSchema.safeParse({
      helpText: "**步骤1**: 个位相加 5+8=13，写3进1\n**步骤2**: 十位相加...",
      level: 2,
      knowledgePoint: "两位数加法",
    });
    expect(result.success).toBe(true);
  });

  test("validates Level 3 output", () => {
    const result = helpGenerateSchema.safeParse({
      helpText: "25 + 38 = 63。你的答案53是因为十位没有加上进位的1。",
      level: 3,
    });
    expect(result.success).toBe(true);
  });

  test("rejects empty helpText", () => {
    const result = helpGenerateSchema.safeParse({
      helpText: "",
      level: 1,
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid level", () => {
    expect(
      helpGenerateSchema.safeParse({ helpText: "hint", level: 0 }).success
    ).toBe(false);
    expect(
      helpGenerateSchema.safeParse({ helpText: "hint", level: 4 }).success
    ).toBe(false);
  });

  test("knowledgePoint is optional", () => {
    const result = helpGenerateSchema.safeParse({
      helpText: "Review the basics.",
      level: 1,
    });
    expect(result.success).toBe(true);
  });
});

describe("helpGeneratePrompt", () => {
  test("builds Level 1 prompt with direction-only instruction", () => {
    const messages = helpGeneratePrompt.build({
      questionContent: "25 + 38 = ?",
      studentAnswer: "53",
      helpLevel: 1,
      subject: "MATH",
      locale: "zh",
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    // Level 1 should NOT include steps or answer
    const sysContent = messages[0].content as string;
    expect(sysContent).toContain("LEVEL 1");
    expect(sysContent).toContain("Do NOT include any steps");
    expect(sysContent).toContain("Chinese");
  });

  test("builds Level 2 prompt with steps instruction", () => {
    const messages = helpGeneratePrompt.build({
      questionContent: "25 + 38 = ?",
      studentAnswer: "53",
      helpLevel: 2,
      subject: "MATH",
      locale: "en",
    });

    const sysContent = messages[0].content as string;
    expect(sysContent).toContain("LEVEL 2");
    expect(sysContent).toContain("step-by-step");
    expect(sysContent).toContain("OMIT the final");
    expect(sysContent).toContain("English");
  });

  test("builds Level 3 prompt with full solution instruction", () => {
    const messages = helpGeneratePrompt.build({
      questionContent: "25 + 38 = ?",
      studentAnswer: "53",
      correctAnswer: "63",
      helpLevel: 3,
      subject: "MATH",
      locale: "zh",
    });

    const sysContent = messages[0].content as string;
    expect(sysContent).toContain("LEVEL 3");
    expect(sysContent).toContain("complete worked solution");

    // User message should include correct answer for L3
    const userContent = messages[1].content as string;
    expect(userContent).toContain("Correct answer: 63");
  });

  test("includes grade in system prompt when provided", () => {
    const messages = helpGeneratePrompt.build({
      questionContent: "test",
      studentAnswer: "test",
      helpLevel: 1,
      grade: "PRIMARY_3",
      locale: "zh",
    });

    const sysContent = messages[0].content as string;
    expect(sysContent).toContain("PRIMARY_3");
  });

  test("has appropriate default options", () => {
    expect(helpGeneratePrompt.defaultOptions?.maxTokens).toBe(1024);
    expect(helpGeneratePrompt.defaultOptions?.temperature).toBe(0.7);
    expect(helpGeneratePrompt.defaultOptions?.responseFormat).toBe("json_object");
  });
});
