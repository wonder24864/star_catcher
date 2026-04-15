/**
 * Unit Tests: SM-2 Hybrid Scheduling
 *
 * Verifies each adjustment factor in calculateHybridReview:
 *   - errorType multipliers (concept / method / calculation / careless)
 *   - slow masterySpeed shortens interval
 *   - high currentWorkload stretches interval
 *   - examProximityDays caps the interval after other adjustments
 *   - interval floor (>= 1 day)
 *   - easeFactor and repetition are never touched
 *
 * See: docs/PHASE3-LAUNCH-PLAN.md §四 D18
 */
import { describe, test, expect } from "vitest";
import {
  calculateHybridReview,
  ERROR_TYPE_MULTIPLIER,
  MIN_INTERVAL_DAYS,
  type SM2Output,
  type HybridInput,
} from "@/lib/domain/spaced-repetition";

const baseSm2: SM2Output = { interval: 10, easeFactor: 2.5, repetition: 3 };

function withInput(overrides: Partial<HybridInput> = {}): HybridInput {
  return {
    sm2Base: baseSm2,
    masterySpeed: 0.8,
    currentWorkload: 2,
    ...overrides,
  };
}

describe("calculateHybridReview", () => {
  describe("errorType scaling", () => {
    test("concept errors shrink interval to 60%", () => {
      const result = calculateHybridReview(withInput({ errorType: "concept" }));
      expect(result.interval).toBe(Math.round(10 * ERROR_TYPE_MULTIPLIER.concept));
    });

    test("method errors shrink interval to 75%", () => {
      const result = calculateHybridReview(withInput({ errorType: "method" }));
      expect(result.interval).toBe(Math.round(10 * ERROR_TYPE_MULTIPLIER.method));
    });

    test("calculation errors leave interval unchanged", () => {
      const result = calculateHybridReview(
        withInput({ errorType: "calculation" }),
      );
      expect(result.interval).toBe(10);
    });

    test("careless errors stretch interval to 120%", () => {
      const result = calculateHybridReview(withInput({ errorType: "careless" }));
      expect(result.interval).toBe(Math.round(10 * ERROR_TYPE_MULTIPLIER.careless));
    });

    test("no errorType leaves interval unchanged by this factor", () => {
      const result = calculateHybridReview(withInput({ errorType: undefined }));
      expect(result.interval).toBe(10);
    });
  });

  describe("masterySpeed", () => {
    test("below SLOW_MASTERY_THRESHOLD shortens interval to 80%", () => {
      const result = calculateHybridReview(withInput({ masterySpeed: 0.3 }));
      expect(result.interval).toBe(Math.round(10 * 0.8));
    });

    test("at 0.5 exact boundary: not triggered (strictly less-than)", () => {
      const result = calculateHybridReview(withInput({ masterySpeed: 0.5 }));
      expect(result.interval).toBe(10);
    });

    test("above threshold leaves interval unchanged by this factor", () => {
      const result = calculateHybridReview(withInput({ masterySpeed: 0.9 }));
      expect(result.interval).toBe(10);
    });
  });

  describe("currentWorkload", () => {
    test("above HIGH_WORKLOAD_THRESHOLD stretches interval to 115%", () => {
      const result = calculateHybridReview(withInput({ currentWorkload: 8 }));
      expect(result.interval).toBe(Math.round(10 * 1.15));
    });

    test("at threshold (==5): not triggered (strictly greater-than)", () => {
      const result = calculateHybridReview(withInput({ currentWorkload: 5 }));
      expect(result.interval).toBe(10);
    });

    test("below threshold leaves interval unchanged by this factor", () => {
      const result = calculateHybridReview(withInput({ currentWorkload: 1 }));
      expect(result.interval).toBe(10);
    });
  });

  describe("examProximityDays cap", () => {
    test("caps interval when exam is closer than computed interval", () => {
      const result = calculateHybridReview(
        withInput({ sm2Base: { ...baseSm2, interval: 30 }, examProximityDays: 7 }),
      );
      expect(result.interval).toBe(7);
    });

    test("does not affect interval when exam is farther", () => {
      const result = calculateHybridReview(
        withInput({ sm2Base: { ...baseSm2, interval: 10 }, examProximityDays: 60 }),
      );
      expect(result.interval).toBe(10);
    });

    test("examProximity of 0 is clamped to MIN_INTERVAL_DAYS", () => {
      const result = calculateHybridReview(
        withInput({ examProximityDays: 0 }),
      );
      expect(result.interval).toBe(MIN_INTERVAL_DAYS);
    });
  });

  describe("combined factors", () => {
    test("concept + slow + high workload + exam cap", () => {
      // 10 * 0.6 (concept) * 0.8 (slow) * 1.15 (workload) = 5.52 → round to 6
      // exam cap 4 → final 4
      const result = calculateHybridReview({
        sm2Base: { interval: 10, easeFactor: 2.5, repetition: 3 },
        errorType: "concept",
        masterySpeed: 0.2,
        currentWorkload: 9,
        examProximityDays: 4,
      });
      expect(result.interval).toBe(4);
    });

    test("interval floors at 1 even for aggressive shrinking", () => {
      // 2 * 0.6 * 0.8 = 0.96 → round to 1
      const result = calculateHybridReview({
        sm2Base: { interval: 2, easeFactor: 2.5, repetition: 0 },
        errorType: "concept",
        masterySpeed: 0.1,
        currentWorkload: 0,
      });
      expect(result.interval).toBe(1);
    });
  });

  describe("invariants", () => {
    test("easeFactor is preserved from SM-2 base", () => {
      const result = calculateHybridReview(
        withInput({ errorType: "concept", masterySpeed: 0.1, currentWorkload: 10 }),
      );
      expect(result.easeFactor).toBe(baseSm2.easeFactor);
    });

    test("repetition is preserved from SM-2 base", () => {
      const result = calculateHybridReview(
        withInput({ errorType: "concept", masterySpeed: 0.1, currentWorkload: 10 }),
      );
      expect(result.repetition).toBe(baseSm2.repetition);
    });
  });
});
