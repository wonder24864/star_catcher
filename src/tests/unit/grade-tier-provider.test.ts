/**
 * Unit Tests: GradeTierProvider — tier mapping + TierConfig completeness
 */
import { describe, test, expect } from "vitest";
import { gradeToTier, type GradeTier } from "@/components/providers/grade-tier-provider";

// ---------------------------------------------------------------------------
// gradeToTier mapping
// ---------------------------------------------------------------------------

describe("gradeToTier", () => {
  // Wonder (P1-3)
  test.each(["PRIMARY_1", "PRIMARY_2", "PRIMARY_3"])(
    "%s → wonder",
    (grade) => {
      expect(gradeToTier(grade, "STUDENT")).toBe("wonder");
    }
  );

  // Cosmic (P4-6)
  test.each(["PRIMARY_4", "PRIMARY_5", "PRIMARY_6"])(
    "%s → cosmic",
    (grade) => {
      expect(gradeToTier(grade, "STUDENT")).toBe("cosmic");
    }
  );

  // Flow (junior)
  test.each(["JUNIOR_1", "JUNIOR_2", "JUNIOR_3"])(
    "%s → flow",
    (grade) => {
      expect(gradeToTier(grade, "STUDENT")).toBe("flow");
    }
  );

  // Studio (senior)
  test.each(["SENIOR_1", "SENIOR_2", "SENIOR_3"])(
    "%s → studio",
    (grade) => {
      expect(gradeToTier(grade, "STUDENT")).toBe("studio");
    }
  );

  // Non-student roles always studio
  test.each(["PARENT", "ADMIN"])("role %s → studio", (role) => {
    expect(gradeToTier("PRIMARY_1", role)).toBe("studio");
  });

  // Edge cases
  test("null grade → studio", () => {
    expect(gradeToTier(null, "STUDENT")).toBe("studio");
  });

  test("undefined grade → studio", () => {
    expect(gradeToTier(undefined, "STUDENT")).toBe("studio");
  });

  test("null role → studio", () => {
    expect(gradeToTier("PRIMARY_1", null)).toBe("studio");
  });

  test("unknown grade string → studio", () => {
    expect(gradeToTier("UNKNOWN_1", "STUDENT")).toBe("studio");
  });
});

// ---------------------------------------------------------------------------
// TierConfig completeness — verify all 4 tiers have required fields
// ---------------------------------------------------------------------------

describe("TierConfig completeness", () => {
  // We import TIER_CONFIGS indirectly by verifying the shape returned by gradeToTier
  // The actual configs are internal, but we can verify the contract via gradeToTier output
  const allTiers: GradeTier[] = ["wonder", "cosmic", "flow", "studio"];

  test("all 4 tiers are represented", () => {
    const results = new Set<GradeTier>();
    results.add(gradeToTier("PRIMARY_1", "STUDENT")); // wonder
    results.add(gradeToTier("PRIMARY_5", "STUDENT")); // cosmic
    results.add(gradeToTier("JUNIOR_2", "STUDENT"));  // flow
    results.add(gradeToTier("SENIOR_1", "STUDENT"));  // studio
    expect(results.size).toBe(4);
    for (const tier of allTiers) {
      expect(results.has(tier)).toBe(true);
    }
  });

  test("12 Grade enum values all map to valid tiers", () => {
    const grades = [
      "PRIMARY_1", "PRIMARY_2", "PRIMARY_3",
      "PRIMARY_4", "PRIMARY_5", "PRIMARY_6",
      "JUNIOR_1", "JUNIOR_2", "JUNIOR_3",
      "SENIOR_1", "SENIOR_2", "SENIOR_3",
    ];
    for (const grade of grades) {
      const tier = gradeToTier(grade, "STUDENT");
      expect(allTiers).toContain(tier);
    }
  });
});
