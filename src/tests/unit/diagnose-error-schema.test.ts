/**
 * Unit Tests: DIAGNOSE_ERROR Zod Schema
 * Validates the AI output schema for error diagnosis.
 */
import { describe, test, expect } from "vitest";
import { diagnoseErrorSchema, errorPatternEnum } from "@/lib/domain/ai/harness/schemas/diagnose-error";

describe("DiagnoseErrorSchema", () => {
  const validOutput = {
    errorPattern: "CONCEPT_CONFUSION",
    errorDescription: "学生混淆了面积和周长的概念",
    weakKnowledgePoints: [
      {
        knowledgePointId: "kp-001",
        severity: "HIGH",
        reasoning: "多次出错，基础概念不清",
      },
    ],
    recommendation: "建议重新学习面积和周长的定义及区别",
  };

  test("validates valid diagnosis output", () => {
    const result = diagnoseErrorSchema.safeParse(validOutput);
    expect(result.success).toBe(true);
  });

  test("accepts all error pattern types", () => {
    const patterns = [
      "CONCEPT_CONFUSION",
      "CALCULATION_ERROR",
      "METHOD_WRONG",
      "CARELESS",
      "OTHER",
    ] as const;

    for (const pattern of patterns) {
      const result = diagnoseErrorSchema.safeParse({
        ...validOutput,
        errorPattern: pattern,
      });
      expect(result.success).toBe(true);
    }
  });

  test("accepts all severity levels", () => {
    const severities = ["HIGH", "MEDIUM", "LOW"] as const;

    for (const severity of severities) {
      const result = diagnoseErrorSchema.safeParse({
        ...validOutput,
        weakKnowledgePoints: [
          { knowledgePointId: "kp-001", severity, reasoning: "test" },
        ],
      });
      expect(result.success).toBe(true);
    }
  });

  test("accepts empty weakKnowledgePoints array", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      weakKnowledgePoints: [],
    });
    expect(result.success).toBe(true);
  });

  test("accepts multiple weak knowledge points", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      weakKnowledgePoints: [
        { knowledgePointId: "kp-001", severity: "HIGH", reasoning: "reason1" },
        { knowledgePointId: "kp-002", severity: "MEDIUM", reasoning: "reason2" },
        { knowledgePointId: "kp-003", severity: "LOW", reasoning: "reason3" },
      ],
    });
    expect(result.success).toBe(true);
  });

  test("rejects invalid error pattern", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      errorPattern: "INVALID_PATTERN",
    });
    expect(result.success).toBe(false);
  });

  test("rejects invalid severity", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      weakKnowledgePoints: [
        { knowledgePointId: "kp-001", severity: "CRITICAL", reasoning: "test" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing required fields", () => {
    const { errorPattern: _, ...missing } = validOutput;
    const result = diagnoseErrorSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  test("rejects empty errorDescription", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      errorDescription: "",
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty knowledgePointId", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      weakKnowledgePoints: [
        { knowledgePointId: "", severity: "HIGH", reasoning: "test" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("rejects empty recommendation", () => {
    const result = diagnoseErrorSchema.safeParse({
      ...validOutput,
      recommendation: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ErrorPatternEnum", () => {
  test("enum has exactly 5 values", () => {
    expect(errorPatternEnum.options).toHaveLength(5);
  });
});
