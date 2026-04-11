/**
 * Unit Tests: SM-2 Spaced Repetition Algorithm
 *
 * Verifies:
 *   - calculateSM2: interval progression, ease factor adjustment, reset on failure
 *   - mapQuality: correct mapping from (isCorrect, difficulty) to SM-2 quality 0-5
 *   - Edge cases: EF floor at 1.3, quality boundary values
 *
 * See: docs/user-stories/mastery-review.md (US-038)
 */
import { describe, test, expect } from "vitest";
import {
  calculateSM2,
  mapQuality,
  MIN_EASE_FACTOR,
  DEFAULT_EASE_FACTOR,
  MASTERY_THRESHOLD,
} from "@/lib/domain/spaced-repetition";

// ─── calculateSM2 ──────────────────────────────

describe("calculateSM2", () => {
  const defaultInput = {
    quality: 4,
    repetition: 0,
    interval: 0,
    easeFactor: DEFAULT_EASE_FACTOR,
  };

  // ── Correct responses (quality >= 3) ──

  test("first correct review: interval = 1 day", () => {
    const result = calculateSM2({ ...defaultInput, quality: 4, repetition: 0 });
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(1);
  });

  test("second correct review: interval = 6 days", () => {
    const result = calculateSM2({ ...defaultInput, quality: 4, repetition: 1, interval: 1 });
    expect(result.interval).toBe(6);
    expect(result.repetition).toBe(2);
  });

  test("third correct review: interval = round(prev * EF)", () => {
    // After 2 correct (rep=2, interval=6), EF adjusted:
    // quality=4: efDelta = 0.1 - (5-4)*(0.08 + (5-4)*0.02) = 0.1 - 0.1 = 0
    // So EF stays at 2.5, interval = round(6 * 2.5) = 15
    const result = calculateSM2({
      quality: 4,
      repetition: 2,
      interval: 6,
      easeFactor: DEFAULT_EASE_FACTOR,
    });
    expect(result.interval).toBe(15);
    expect(result.repetition).toBe(3);
  });

  test("quality=5 (perfect) increases ease factor", () => {
    // efDelta = 0.1 - (5-5)*(0.08 + (5-5)*0.02) = 0.1
    const result = calculateSM2({
      quality: 5,
      repetition: 2,
      interval: 6,
      easeFactor: DEFAULT_EASE_FACTOR,
    });
    expect(result.easeFactor).toBe(2.6);
    // interval = round(6 * 2.6) = 16
    expect(result.interval).toBe(16);
  });

  test("quality=3 (barely correct) decreases ease factor", () => {
    // efDelta = 0.1 - (5-3)*(0.08 + (5-3)*0.02) = 0.1 - 2*(0.08+0.04) = 0.1 - 0.24 = -0.14
    // newEF = 2.5 - 0.14 = 2.36
    const result = calculateSM2({
      quality: 3,
      repetition: 2,
      interval: 6,
      easeFactor: DEFAULT_EASE_FACTOR,
    });
    expect(result.easeFactor).toBeCloseTo(2.36, 5);
    // interval = round(6 * 2.36) = 14
    expect(result.interval).toBe(14);
  });

  // ── Incorrect responses (quality < 3) ──

  test("incorrect response: reset interval to 1, repetition to 0", () => {
    const result = calculateSM2({
      quality: 2,
      repetition: 5,
      interval: 30,
      easeFactor: 2.5,
    });
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(0);
  });

  test("quality=0 (blackout): ease factor decreases significantly", () => {
    // efDelta = 0.1 - (5-0)*(0.08 + (5-0)*0.02) = 0.1 - 5*(0.08+0.10) = 0.1 - 0.9 = -0.8
    // newEF = max(1.3, 2.5 - 0.8) = 1.7
    const result = calculateSM2({
      quality: 0,
      repetition: 3,
      interval: 15,
      easeFactor: 2.5,
    });
    expect(result.easeFactor).toBeCloseTo(1.7, 5);
    expect(result.interval).toBe(1);
    expect(result.repetition).toBe(0);
  });

  test("quality=1: ease factor decreases", () => {
    // efDelta = 0.1 - (5-1)*(0.08 + (5-1)*0.02) = 0.1 - 4*(0.08+0.08) = 0.1 - 0.64 = -0.54
    // newEF = max(1.3, 2.5 - 0.54) = 1.96
    const result = calculateSM2({
      quality: 1,
      repetition: 2,
      interval: 6,
      easeFactor: 2.5,
    });
    expect(result.easeFactor).toBeCloseTo(1.96, 5);
    expect(result.interval).toBe(1);
  });

  // ── Ease Factor floor ──

  test("ease factor never goes below MIN_EASE_FACTOR (1.3)", () => {
    // Start with EF=1.3 (minimum), quality=0 → huge penalty
    const result = calculateSM2({
      quality: 0,
      repetition: 1,
      interval: 1,
      easeFactor: MIN_EASE_FACTOR,
    });
    expect(result.easeFactor).toBe(MIN_EASE_FACTOR);
  });

  test("repeated quality=3 stabilizes ease factor above 1.3", () => {
    let ef = DEFAULT_EASE_FACTOR;
    let rep = 0;
    let interval = 0;

    // Simulate 10 reviews at quality=3
    for (let i = 0; i < 10; i++) {
      const result = calculateSM2({ quality: 3, repetition: rep, interval, easeFactor: ef });
      ef = result.easeFactor;
      rep = result.repetition;
      interval = result.interval;
    }

    expect(ef).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
  });

  // ── Input validation ──

  test("throws on quality < 0", () => {
    expect(() =>
      calculateSM2({ quality: -1, repetition: 0, interval: 0, easeFactor: 2.5 }),
    ).toThrow("quality must be 0-5");
  });

  test("throws on quality > 5", () => {
    expect(() =>
      calculateSM2({ quality: 6, repetition: 0, interval: 0, easeFactor: 2.5 }),
    ).toThrow("quality must be 0-5");
  });

  // ── Progression simulation ──

  test("full progression: quality=4 grows interval over time", () => {
    let ef = DEFAULT_EASE_FACTOR;
    let rep = 0;
    let interval = 0;

    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      const result = calculateSM2({ quality: 4, repetition: rep, interval, easeFactor: ef });
      ef = result.easeFactor;
      rep = result.repetition;
      interval = result.interval;
      intervals.push(interval);
    }

    // Expected progression: 1, 6, 15, 38, 95, ...
    expect(intervals[0]).toBe(1);
    expect(intervals[1]).toBe(6);
    // Each subsequent interval should be larger than the previous
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });
});

// ─── mapQuality ─────────────────────────────────

describe("mapQuality", () => {
  // Correct answers
  test("correct + very easy (1) → quality 5", () => {
    expect(mapQuality(true, 1)).toBe(5);
  });

  test("correct + easy (2) → quality 5", () => {
    expect(mapQuality(true, 2)).toBe(5);
  });

  test("correct + normal (3) → quality 4", () => {
    expect(mapQuality(true, 3)).toBe(4);
  });

  test("correct + hard (4) → quality 3", () => {
    expect(mapQuality(true, 4)).toBe(3);
  });

  test("correct + very hard (5) → quality 3", () => {
    expect(mapQuality(true, 5)).toBe(3);
  });

  // Incorrect answers
  test("incorrect + easy difficulty (1-3) → quality 1", () => {
    expect(mapQuality(false, 1)).toBe(1);
    expect(mapQuality(false, 2)).toBe(1);
    expect(mapQuality(false, 3)).toBe(1);
  });

  test("incorrect + hard difficulty (4-5) → quality 0 (blackout)", () => {
    expect(mapQuality(false, 4)).toBe(0);
    expect(mapQuality(false, 5)).toBe(0);
  });

  // Input validation
  test("throws on difficulty < 1", () => {
    expect(() => mapQuality(true, 0)).toThrow("selfRatedDifficulty must be 1-5");
  });

  test("throws on difficulty > 5", () => {
    expect(() => mapQuality(true, 6)).toThrow("selfRatedDifficulty must be 1-5");
  });
});

// ─── Constants ──────────────────────────────────

describe("SM-2 constants", () => {
  test("MIN_EASE_FACTOR is 1.3", () => {
    expect(MIN_EASE_FACTOR).toBe(1.3);
  });

  test("DEFAULT_EASE_FACTOR is 2.5", () => {
    expect(DEFAULT_EASE_FACTOR).toBe(2.5);
  });

  test("MASTERY_THRESHOLD is 3", () => {
    expect(MASTERY_THRESHOLD).toBe(3);
  });
});
