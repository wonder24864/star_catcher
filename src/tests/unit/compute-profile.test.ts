/**
 * Unit Tests: Weakness Profile Computation
 *
 * Tests severity classification, trend detection, and profile building.
 */
import { describe, test, expect } from "vitest";
import {
  classifySeverity,
  detectTrend,
  buildWeaknessProfile,
} from "@/lib/domain/weakness/compute-profile";
import { computeSemesterStart } from "@/lib/domain/weakness/semester";
import type { MasteryStateView, InterventionRecord } from "@/lib/domain/memory/types";

// ─── Severity Classification ─────────────────────

describe("classifySeverity", () => {
  test("HIGH when errorCount >= 5", () => {
    expect(classifySeverity(7, 2)).toBe("HIGH"); // 5 errors
  });

  test("HIGH when correctRate < 0.3", () => {
    expect(classifySeverity(10, 2)).toBe("HIGH"); // 0.2 rate
  });

  test("MEDIUM when errorCount >= 3", () => {
    expect(classifySeverity(5, 2)).toBe("MEDIUM"); // 3 errors, rate 0.4
  });

  test("LOW for small error counts", () => {
    expect(classifySeverity(3, 2)).toBe("LOW"); // 1 error
  });

  test("HIGH for zero attempts (no data → correctRate 0)", () => {
    // Edge case: 0/0 = correctRate 0 < 0.3 → HIGH
    // In practice, students with 0 attempts won't have MasteryState records
    expect(classifySeverity(0, 0)).toBe("HIGH");
  });

  test("HIGH takes precedence: 5+ errors even with decent rate", () => {
    expect(classifySeverity(20, 15)).toBe("HIGH"); // 5 errors, rate 0.75
  });
});

// ─── Trend Detection ─────────────────────────────

function makeIntervention(
  type: string,
  daysAgo: number,
): InterventionRecord {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `int-${daysAgo}`,
    type: type as "DIAGNOSIS",
    content: {},
    agentId: null,
    skillId: null,
    foundationalWeakness: false,
    createdAt: date,
  };
}

describe("detectTrend", () => {
  test("STABLE with < 2 interventions", () => {
    expect(detectTrend([])).toBe("STABLE");
    expect(detectTrend([makeIntervention("DIAGNOSIS", 1)])).toBe("STABLE");
  });

  test("WORSENING when recent half has more error interventions", () => {
    const interventions = [
      makeIntervention("REVIEW", 30),    // old: non-error
      makeIntervention("REVIEW", 20),    // old: non-error
      makeIntervention("DIAGNOSIS", 5),  // recent: error
      makeIntervention("DIAGNOSIS", 2),  // recent: error
    ];
    expect(detectTrend(interventions)).toBe("WORSENING");
  });

  test("IMPROVING when older half has more error interventions", () => {
    const interventions = [
      makeIntervention("DIAGNOSIS", 30),  // old: error
      makeIntervention("HINT", 25),       // old: error
      makeIntervention("REVIEW", 5),      // recent: non-error
      makeIntervention("REVIEW", 2),      // recent: non-error
    ];
    expect(detectTrend(interventions)).toBe("IMPROVING");
  });

  test("STABLE when error density is similar across halves", () => {
    const interventions = [
      makeIntervention("DIAGNOSIS", 30),
      makeIntervention("REVIEW", 20),
      makeIntervention("DIAGNOSIS", 5),
      makeIntervention("REVIEW", 2),
    ];
    expect(detectTrend(interventions)).toBe("STABLE");
  });
});

// ─── Profile Builder ─────────────────────────────

function makeMastery(
  kpId: string,
  totalAttempts: number,
  correctAttempts: number,
): MasteryStateView {
  return {
    id: `ms-${kpId}`,
    studentId: "s1",
    knowledgePointId: kpId,
    status: "NEW_ERROR",
    totalAttempts,
    correctAttempts,
    lastAttemptAt: new Date(),
    masteredAt: null,
    version: 1,
    archived: false,
  };
}

describe("buildWeaknessProfile", () => {
  test("builds profile with correct severity ordering", () => {
    const weakPoints = [
      makeMastery("kp-low", 2, 1),     // LOW (1 error)
      makeMastery("kp-high", 8, 2),    // HIGH (6 errors)
      makeMastery("kp-med", 5, 2),     // MEDIUM (3 errors)
    ];

    const result = buildWeaknessProfile({
      weakPoints,
      interventionsByKP: new Map(),
    });

    expect(result.weakPoints).toHaveLength(3);
    expect(result.weakPoints[0]!.severity).toBe("HIGH");
    expect(result.weakPoints[1]!.severity).toBe("MEDIUM");
    expect(result.weakPoints[2]!.severity).toBe("LOW");
  });

  test("empty weak points returns empty profile", () => {
    const result = buildWeaknessProfile({
      weakPoints: [],
      interventionsByKP: new Map(),
    });
    expect(result.weakPoints).toHaveLength(0);
  });

  test("incorporates trend from intervention history", () => {
    const weakPoints = [makeMastery("kp-1", 6, 1)];
    const interventions = new Map([
      ["kp-1", [
        makeIntervention("REVIEW", 30),
        makeIntervention("REVIEW", 20),
        makeIntervention("DIAGNOSIS", 5),
        makeIntervention("DIAGNOSIS", 2),
      ]],
    ]);

    const result = buildWeaknessProfile({
      weakPoints,
      interventionsByKP: interventions,
    });

    expect(result.weakPoints[0]!.trend).toBe("WORSENING");
  });
});

// ─── Semester Computation ────────────────────────

describe("computeSemesterStart", () => {
  test("spring semester: March → Feb 1 same year", () => {
    const result = computeSemesterStart(new Date(2026, 2, 15)); // March 15
    expect(result).toEqual(new Date(2026, 1, 1)); // Feb 1
  });

  test("spring semester: July → Feb 1 same year", () => {
    const result = computeSemesterStart(new Date(2026, 6, 1)); // July 1
    expect(result).toEqual(new Date(2026, 1, 1));
  });

  test("fall semester: October → Sep 1 same year", () => {
    const result = computeSemesterStart(new Date(2026, 9, 10)); // Oct 10
    expect(result).toEqual(new Date(2026, 8, 1)); // Sep 1
  });

  test("fall semester: January → Sep 1 previous year", () => {
    const result = computeSemesterStart(new Date(2026, 0, 15)); // Jan 15
    expect(result).toEqual(new Date(2025, 8, 1)); // Sep 1, 2025
  });

  test("boundary: February → Feb 1 same year", () => {
    const result = computeSemesterStart(new Date(2026, 1, 1)); // Feb 1
    expect(result).toEqual(new Date(2026, 1, 1));
  });

  test("boundary: September → Sep 1 same year", () => {
    const result = computeSemesterStart(new Date(2026, 8, 1)); // Sep 1
    expect(result).toEqual(new Date(2026, 8, 1));
  });
});
