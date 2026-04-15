/**
 * Unit Tests: isWithinLearningHours
 *
 * Verifies:
 *   - Null bounds → always allowed (no restriction)
 *   - Partial config (one bound null) → no restriction
 *   - Same-day window: inclusive endpoints
 *   - Overnight window (start > end): `now >= start || now <= end`
 *   - Zero-width window → no restriction (degenerate config)
 *   - Invalid HH:MM strings → no restriction (defensive)
 *
 * See: docs/user-stories/parent-learning-control.md (US-054)
 */
import { describe, test, expect } from "vitest";
import { isWithinLearningHours } from "@/lib/domain/parent/is-within-learning-hours";

function atLocal(hh: number, mm = 0): Date {
  const d = new Date(2026, 3, 15, hh, mm, 0, 0); // arbitrary date
  return d;
}

describe("isWithinLearningHours", () => {
  describe("null bounds", () => {
    test("both null → allowed", () => {
      expect(
        isWithinLearningHours(atLocal(3), { start: null, end: null }),
      ).toBe(true);
    });

    test("only start null → allowed (incomplete config)", () => {
      expect(
        isWithinLearningHours(atLocal(3), {
          start: null,
          end: "22:00",
        }),
      ).toBe(true);
    });

    test("only end null → allowed (incomplete config)", () => {
      expect(
        isWithinLearningHours(atLocal(3), {
          start: "08:00",
          end: null,
        }),
      ).toBe(true);
    });
  });

  describe("same-day window", () => {
    const window = { start: "08:00", end: "22:00" };

    test("inside window", () => {
      expect(isWithinLearningHours(atLocal(15), window)).toBe(true);
    });

    test("at start boundary", () => {
      expect(isWithinLearningHours(atLocal(8), window)).toBe(true);
    });

    test("at end boundary", () => {
      expect(isWithinLearningHours(atLocal(22), window)).toBe(true);
    });

    test("before start", () => {
      expect(isWithinLearningHours(atLocal(7, 59), window)).toBe(false);
    });

    test("after end", () => {
      expect(isWithinLearningHours(atLocal(22, 1), window)).toBe(false);
    });
  });

  describe("overnight window", () => {
    const window = { start: "22:00", end: "07:00" };

    test("late night (after start)", () => {
      expect(isWithinLearningHours(atLocal(23, 30), window)).toBe(true);
    });

    test("early morning (before end)", () => {
      expect(isWithinLearningHours(atLocal(6, 0), window)).toBe(true);
    });

    test("midday (outside both)", () => {
      expect(isWithinLearningHours(atLocal(12, 0), window)).toBe(false);
    });

    test("at start boundary", () => {
      expect(isWithinLearningHours(atLocal(22, 0), window)).toBe(true);
    });

    test("at end boundary", () => {
      expect(isWithinLearningHours(atLocal(7, 0), window)).toBe(true);
    });

    test("just after end", () => {
      expect(isWithinLearningHours(atLocal(7, 1), window)).toBe(false);
    });

    test("just before start", () => {
      expect(isWithinLearningHours(atLocal(21, 59), window)).toBe(false);
    });
  });

  describe("edge cases", () => {
    test("zero-width window → allowed", () => {
      expect(
        isWithinLearningHours(atLocal(10), {
          start: "08:00",
          end: "08:00",
        }),
      ).toBe(true);
    });

    test("invalid HH:MM → allowed (defensive)", () => {
      expect(
        isWithinLearningHours(atLocal(10), {
          start: "25:00",
          end: "22:00",
        }),
      ).toBe(true);
    });
  });
});
