/**
 * SM-2 Spaced Repetition Algorithm
 *
 * Pure functions implementing the SuperMemo SM-2 algorithm.
 * No side effects, no DB access — designed for unit testing and reuse.
 *
 * Reference: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2
 *
 * See: docs/user-stories/mastery-review.md (US-038)
 */

// ─── Types ──────────────────────────────────────

export interface SM2Input {
  /** SM-2 quality rating 0-5 */
  quality: number;
  /** Current consecutive correct count (n) */
  repetition: number;
  /** Current interval in days */
  interval: number;
  /** Current ease factor (≥ 1.3) */
  easeFactor: number;
}

export interface SM2Output {
  /** New interval in days */
  interval: number;
  /** New ease factor */
  easeFactor: number;
  /** New consecutive correct count */
  repetition: number;
}

// ─── Constants ──────────────────────────────────

/** Minimum ease factor to prevent intervals from shrinking too fast */
export const MIN_EASE_FACTOR = 1.3;

/** Default ease factor for new review schedules */
export const DEFAULT_EASE_FACTOR = 2.5;

/** Mastery threshold: consecutive correct reviews needed for MASTERED */
export const MASTERY_THRESHOLD = 3;

// ─── SM-2 Calculator ───────────────────────────

/**
 * Calculate the next SM-2 parameters based on review quality.
 *
 * Quality scale:
 *   5 — perfect response
 *   4 — correct after hesitation
 *   3 — correct with serious difficulty
 *   2 — incorrect; easy to recall correct answer
 *   1 — incorrect; remembered upon seeing correct answer
 *   0 — complete blackout
 *
 * If quality ≥ 3 (correct): advance repetition, calculate new interval.
 * If quality < 3 (incorrect): reset to interval=1, repetition=0.
 */
export function calculateSM2(input: SM2Input): SM2Output {
  const { quality, repetition, interval, easeFactor } = input;

  if (quality < 0 || quality > 5) {
    throw new Error(`SM-2 quality must be 0-5, got ${quality}`);
  }

  // Update ease factor (applied regardless of quality)
  const efDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  const newEaseFactor = Math.max(MIN_EASE_FACTOR, easeFactor + efDelta);

  if (quality >= 3) {
    // Correct response: advance repetition
    const newRepetition = repetition + 1;
    let newInterval: number;

    if (newRepetition === 1) {
      newInterval = 1;
    } else if (newRepetition === 2) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEaseFactor);
    }

    return {
      interval: newInterval,
      easeFactor: newEaseFactor,
      repetition: newRepetition,
    };
  } else {
    // Incorrect response: reset
    return {
      interval: 1,
      easeFactor: newEaseFactor,
      repetition: 0,
    };
  }
}

// ─── Quality Mapping ───────────────────────────

/**
 * Map student self-assessment to SM-2 quality score (0-5).
 *
 * @param isCorrect — whether the student answered correctly
 * @param selfRatedDifficulty — 1 (very easy) to 5 (very hard)
 * @returns SM-2 quality 0-5
 */
export function mapQuality(
  isCorrect: boolean,
  selfRatedDifficulty: number,
): number {
  if (selfRatedDifficulty < 1 || selfRatedDifficulty > 5) {
    throw new Error(
      `selfRatedDifficulty must be 1-5, got ${selfRatedDifficulty}`,
    );
  }

  if (!isCorrect) {
    // Incorrect: 0 = blackout, 1 = recognized upon seeing answer
    return selfRatedDifficulty >= 4 ? 0 : 1;
  }

  // Correct: map difficulty to quality 3-5
  //   difficulty 1 (very easy)  → quality 5 (perfect)
  //   difficulty 2 (easy)       → quality 5
  //   difficulty 3 (normal)     → quality 4 (correct with hesitation)
  //   difficulty 4 (hard)       → quality 3 (correct with difficulty)
  //   difficulty 5 (very hard)  → quality 3
  switch (selfRatedDifficulty) {
    case 1:
      return 5;
    case 2:
      return 5;
    case 3:
      return 4;
    case 4:
      return 3;
    case 5:
      return 3;
    default:
      return 4;
  }
}
