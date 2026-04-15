/**
 * Hybrid SM-2 Review Scheduling
 *
 * Layers AI-suggested adjustments on top of the pure SM-2 baseline:
 *   - errorType:           concept errors shorten interval, careless errors lengthen
 *   - masterySpeed:        slow learners get shorter intervals
 *   - currentWorkload:     heavy workload day → interval stretched slightly
 *   - examProximityDays:   hard cap so review doesn't slip past the exam
 *
 * Pure function. No DB/AI access. Invoked by mastery-evaluation handler after
 * the Agent returns an sm2Adjustment suggestion. When no adjustment is supplied
 * the caller should fall back to the plain SM-2 result.
 *
 * See: docs/PHASE3-LAUNCH-PLAN.md §四 D18
 */

import type { SM2Output } from "./sm2";

// ─── Types ──────────────────────────────────────

export type ErrorType = "calculation" | "concept" | "careless" | "method";

export interface HybridInput {
  /** Baseline SM-2 result (interval, easeFactor, repetition) */
  sm2Base: SM2Output;
  /** Agent-detected dominant error type, if any */
  errorType?: ErrorType;
  /** Rolling correct rate over recent attempts (0..1) */
  masterySpeed: number;
  /** Current day's outstanding DailyTask count */
  currentWorkload: number;
  /** Days until next exam (if known); caps the final interval */
  examProximityDays?: number;
}

// ─── Adjustment Constants ───────────────────────

/** Concept-level errors need higher repetition frequency */
export const ERROR_TYPE_MULTIPLIER: Record<ErrorType, number> = {
  concept: 0.6,
  method: 0.75,
  calculation: 1.0,
  careless: 1.2,
};

/** Threshold below which masterySpeed triggers a shorter interval */
export const SLOW_MASTERY_THRESHOLD = 0.5;
export const SLOW_MASTERY_MULTIPLIER = 0.8;

/** Workload count above which we stretch interval to relieve pressure */
export const HIGH_WORKLOAD_THRESHOLD = 5;
export const HIGH_WORKLOAD_MULTIPLIER = 1.15;

/** Lower bound on interval days (never schedule for today or the past) */
export const MIN_INTERVAL_DAYS = 1;

// ─── Hybrid Calculator ──────────────────────────

/**
 * Apply AI adjustments to the SM-2 baseline.
 *
 * easeFactor and repetition are never touched — only the interval is scaled
 * and optionally capped. This keeps the long-term SM-2 trajectory intact and
 * treats hybrid scheduling as a per-review nudge.
 */
export function calculateHybridReview(input: HybridInput): SM2Output {
  const { sm2Base, errorType, masterySpeed, currentWorkload, examProximityDays } = input;

  let interval = sm2Base.interval;

  // 1. Error-type scaling
  if (errorType) {
    interval *= ERROR_TYPE_MULTIPLIER[errorType];
  }

  // 2. Slow mastery → shorten
  if (masterySpeed < SLOW_MASTERY_THRESHOLD) {
    interval *= SLOW_MASTERY_MULTIPLIER;
  }

  // 3. High workload → stretch
  if (currentWorkload > HIGH_WORKLOAD_THRESHOLD) {
    interval *= HIGH_WORKLOAD_MULTIPLIER;
  }

  // 4. Round and enforce floor
  interval = Math.max(MIN_INTERVAL_DAYS, Math.round(interval));

  // 5. Exam proximity cap (applied after rounding to avoid rounding past the exam)
  if (examProximityDays !== undefined && examProximityDays < interval) {
    interval = Math.max(MIN_INTERVAL_DAYS, examProximityDays);
  }

  return {
    interval,
    easeFactor: sm2Base.easeFactor,
    repetition: sm2Base.repetition,
  };
}
