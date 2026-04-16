/**
 * Unit Tests: LEARNING_SUGGESTION Harness Operation
 * Sprint 18 — US-061
 */
import { describe, test, expect } from "vitest";
import { learningSuggestionSchema } from "@/lib/domain/ai/harness/schemas/learning-suggestion";

describe("learningSuggestionSchema", () => {
  test("validates a complete valid output", () => {
    const valid = {
      suggestions: [
        {
          category: "review_priority",
          title: "Review fractions",
          description: "Focus on fraction addition with different denominators",
          relatedKnowledgePoints: ["Fraction Addition"],
          priority: "high",
        },
      ],
      attentionItems: [
        {
          type: "regression_risk",
          description: "Decimal multiplication regressed",
          actionRequired: true,
        },
      ],
      parentActions: [
        {
          action: "Practice 5 min daily",
          reason: "Short daily practice helps retention",
          frequency: "daily",
        },
      ],
    };

    const result = learningSuggestionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("requires at least one suggestion", () => {
    const invalid = {
      suggestions: [],
      attentionItems: [],
      parentActions: [],
    };

    const result = learningSuggestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid category", () => {
    const invalid = {
      suggestions: [
        {
          category: "invalid_category",
          title: "Test",
          description: "Test",
          relatedKnowledgePoints: [],
          priority: "high",
        },
      ],
      attentionItems: [],
      parentActions: [],
    };

    const result = learningSuggestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid priority", () => {
    const invalid = {
      suggestions: [
        {
          category: "review_priority",
          title: "Test",
          description: "Test",
          relatedKnowledgePoints: [],
          priority: "critical", // not a valid priority
        },
      ],
      attentionItems: [],
      parentActions: [],
    };

    const result = learningSuggestionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("allows empty attentionItems and parentActions", () => {
    const minimal = {
      suggestions: [
        {
          category: "learning_strategy",
          title: "Keep going",
          description: "Good progress",
          relatedKnowledgePoints: [],
          priority: "low",
        },
      ],
      attentionItems: [],
      parentActions: [],
    };

    const result = learningSuggestionSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  test("validates attention item types", () => {
    const valid = {
      suggestions: [
        {
          category: "review_priority",
          title: "Test",
          description: "Test",
          relatedKnowledgePoints: [],
          priority: "high",
        },
      ],
      attentionItems: [
        { type: "regression_risk", description: "Regressed", actionRequired: true },
        { type: "foundational_gap", description: "Gap found", actionRequired: false },
        { type: "overload_warning", description: "Too many", actionRequired: true },
      ],
      parentActions: [],
    };

    const result = learningSuggestionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test("validates frequency enum", () => {
    const valid = {
      suggestions: [
        {
          category: "practice_focus",
          title: "Test",
          description: "Test",
          relatedKnowledgePoints: [],
          priority: "medium",
        },
      ],
      attentionItems: [],
      parentActions: [
        { action: "Daily drill", reason: "Builds habit", frequency: "daily" },
        { action: "Weekly review", reason: "Spaced repetition", frequency: "weekly" },
        { action: "Check on demand", reason: "Flexible", frequency: "as_needed" },
      ],
    };

    const result = learningSuggestionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });
});
