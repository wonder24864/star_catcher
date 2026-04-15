/**
 * Unit Tests: generate-explanation prompt + schema (Sprint 13, Task 117).
 */
import { describe, test, expect } from "vitest";
import {
  explanationCardSchema,
  type ExplanationCard,
} from "@/lib/domain/ai/harness/schemas/generate-explanation";
import { generateExplanationPrompt } from "@/lib/domain/ai/prompts/generate-explanation";

describe("ExplanationCard schema", () => {
  test("accepts a valid static card", () => {
    const card: ExplanationCard = {
      format: "static",
      title: "Adding Fractions",
      steps: [{ content: "Find common denominator." }],
      metadata: { targetGrade: "K5", difficulty: "MEDIUM" },
    };
    const result = explanationCardSchema.safeParse(card);
    expect(result.success).toBe(true);
  });

  test("accepts interactive card with question/expectedAnswer", () => {
    const card = {
      format: "interactive",
      title: "Solving x",
      steps: [
        { content: "Step 1", question: "what is x?", expectedAnswer: "5" },
        { content: "Done." },
      ],
    };
    const result = explanationCardSchema.safeParse(card);
    expect(result.success).toBe(true);
  });

  test("rejects unknown format", () => {
    const result = explanationCardSchema.safeParse({
      format: "video",
      title: "x",
      steps: [{ content: "x" }],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty steps array", () => {
    const result = explanationCardSchema.safeParse({
      format: "static",
      title: "x",
      steps: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("generateExplanationPrompt.build", () => {
  test("includes auto-format selection rules when format=auto", () => {
    const messages = generateExplanationPrompt.build({
      questionContent: "1+1=?",
      correctAnswer: "2",
      studentAnswer: "3",
      kpName: "Addition",
      grade: "K3",
      format: "auto",
      locale: "zh-CN",
    });
    expect(messages).toHaveLength(2);
    const sys = messages[0].content;
    expect(sys).toContain("Auto-select");
    expect(sys).toContain("K1–K6");
    expect(sys).toContain("interactive");
  });

  test("forces format when explicit", () => {
    const messages = generateExplanationPrompt.build({
      questionContent: "q",
      correctAnswer: "a",
      studentAnswer: "b",
      kpName: "kp",
      format: "static",
      locale: "en",
    });
    const sys = messages[0].content;
    expect(sys).toContain('The format MUST be exactly: "static"');
  });

  test("locale en switches output language to English", () => {
    const messages = generateExplanationPrompt.build({
      questionContent: "q",
      correctAnswer: "a",
      studentAnswer: "b",
      kpName: "kp",
      format: "auto",
      locale: "en",
    });
    expect(messages[0].content).toContain("Output language: English");
  });
});
