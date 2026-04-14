/**
 * Unit Tests: Operation Registry
 *
 * Verifies that callAIOperation correctly routes all 7 AIOperationType values
 * and rejects unknown operations.
 *
 * See: docs/sprints/sprint-9-skill-gap.md (Task 82)
 */
import { describe, test, expect, vi } from "vitest";

// Mock all 7 operation modules before importing registry
vi.mock("@/lib/domain/ai/operations/recognize-homework", () => ({
  recognizeHomework: vi.fn().mockResolvedValue({ success: true, data: { questions: [] } }),
}));
vi.mock("@/lib/domain/ai/operations/subject-detect", () => ({
  detectSubject: vi.fn().mockResolvedValue({ success: true, data: { subject: "MATH" } }),
}));
vi.mock("@/lib/domain/ai/operations/help-generate", () => ({
  generateHelp: vi.fn().mockResolvedValue({ success: true, data: { helpText: "hint" } }),
}));
vi.mock("@/lib/domain/ai/operations/grade-answer", () => ({
  gradeAnswer: vi.fn().mockResolvedValue({ success: true, data: { isCorrect: true } }),
}));
vi.mock("@/lib/domain/ai/operations/extract-knowledge-points", () => ({
  extractKnowledgePoints: vi.fn().mockResolvedValue({ success: true, data: { knowledgePoints: [] } }),
}));
vi.mock("@/lib/domain/ai/operations/classify-question-knowledge", () => ({
  classifyQuestionKnowledge: vi.fn().mockResolvedValue({ success: true, data: { mappings: [] } }),
}));
vi.mock("@/lib/domain/ai/operations/diagnose-error", () => ({
  diagnoseError: vi.fn().mockResolvedValue({ success: true, data: { errorPattern: "test" } }),
}));

import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import { recognizeHomework } from "@/lib/domain/ai/operations/recognize-homework";
import { detectSubject } from "@/lib/domain/ai/operations/subject-detect";
import { generateHelp } from "@/lib/domain/ai/operations/help-generate";
import { gradeAnswer } from "@/lib/domain/ai/operations/grade-answer";
import { extractKnowledgePoints } from "@/lib/domain/ai/operations/extract-knowledge-points";
import { classifyQuestionKnowledge } from "@/lib/domain/ai/operations/classify-question-knowledge";
import { diagnoseError } from "@/lib/domain/ai/operations/diagnose-error";

const ctx = { userId: "u1", locale: "zh-CN", correlationId: "test" };

describe("Operation Registry", () => {
  test("routes OCR_RECOGNIZE", async () => {
    const result = await callAIOperation("OCR_RECOGNIZE", { imageUrls: ["url1"] }, ctx);
    expect(result.success).toBe(true);
    expect(recognizeHomework).toHaveBeenCalledWith(
      expect.objectContaining({ imageUrls: ["url1"], context: ctx }),
    );
  });

  test("routes SUBJECT_DETECT", async () => {
    const result = await callAIOperation("SUBJECT_DETECT", { questionContent: "1+1=?" }, ctx);
    expect(result.success).toBe(true);
    expect(detectSubject).toHaveBeenCalledWith(
      expect.objectContaining({ questionContent: "1+1=?", context: ctx }),
    );
  });

  test("routes HELP_GENERATE", async () => {
    const data = { questionContent: "q", studentAnswer: "a", helpLevel: 1 };
    const result = await callAIOperation("HELP_GENERATE", data, ctx);
    expect(result.success).toBe(true);
    expect(generateHelp).toHaveBeenCalledWith(
      expect.objectContaining({ questionContent: "q", helpLevel: 1, context: ctx }),
    );
  });

  test("routes GRADE_ANSWER", async () => {
    const data = { questionContent: "q", studentAnswer: "a" };
    const result = await callAIOperation("GRADE_ANSWER", data, ctx);
    expect(result.success).toBe(true);
    expect(gradeAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ questionContent: "q", context: ctx }),
    );
  });

  test("routes EXTRACT_KNOWLEDGE_POINTS", async () => {
    const data = { tocText: "toc", bookTitle: "book", subject: "MATH", schoolLevel: "JUNIOR" };
    const result = await callAIOperation("EXTRACT_KNOWLEDGE_POINTS", data, ctx);
    expect(result.success).toBe(true);
    expect(extractKnowledgePoints).toHaveBeenCalledWith(
      expect.objectContaining({ tocText: "toc", context: ctx }),
    );
  });

  test("routes CLASSIFY_QUESTION_KNOWLEDGE", async () => {
    const data = { questionText: "q", questionSubject: "MATH", candidates: [] };
    const result = await callAIOperation("CLASSIFY_QUESTION_KNOWLEDGE", data, ctx);
    expect(result.success).toBe(true);
    expect(classifyQuestionKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({ questionText: "q", context: ctx }),
    );
  });

  test("routes DIAGNOSE_ERROR", async () => {
    const data = { question: "q", correctAnswer: "a", studentAnswer: "b", subject: "MATH" };
    const result = await callAIOperation("DIAGNOSE_ERROR", data, ctx);
    expect(result.success).toBe(true);
    expect(diagnoseError).toHaveBeenCalledWith(
      expect.objectContaining({ question: "q", subject: "MATH", context: ctx }),
    );
  });

  test.each([
    "WEAKNESS_PROFILE",
    "INTERVENTION_PLAN",
    "MASTERY_EVALUATE",
    "FIND_SIMILAR",
    "GENERATE_EXPLANATION",
    "EVAL_JUDGE",
  ])("Phase 3 stub %s throws not-yet-implemented", async (op) => {
    await expect(callAIOperation(op, {}, ctx)).rejects.toThrow("not yet implemented");
  });

  test("throws on unknown operation", async () => {
    await expect(
      callAIOperation("NONEXISTENT", {}, ctx),
    ).rejects.toThrow("Unknown AI operation: NONEXISTENT");
  });
});
