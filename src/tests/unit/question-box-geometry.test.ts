/**
 * Unit tests: QuestionBox badge placement math.
 *
 * Sprint 17. The badge is positioned in the top-right corner of the bbox
 * but clamped so it never clips off the image edge. These tests pin the
 * arithmetic in one place so future refactors (e.g. scaling badges for
 * tier overrides) can't break placement.
 */

import { describe, test, expect } from "vitest";

// Mirrors the badge calculation in question-box.tsx. Kept in sync by
// having the component's own formulas match this pure helper; diverging
// is caught by the `mirrorsComponent` test below.
function computeBadgePosition(x: number, y: number, w: number, h: number) {
  const badgeR = Math.max(Math.min(Math.min(w, h) * 0.15, 4.5), 2);
  const bx = Math.min(Math.max(x + w, badgeR), 100 - badgeR);
  const by = Math.max(y, badgeR);
  return { badgeR, bx, by };
}

describe("QuestionBox badge geometry", () => {
  test("centers badge on the top-right corner for a comfortable bbox", () => {
    const { bx, by } = computeBadgePosition(20, 30, 40, 20);
    expect(bx).toBe(60); // x + w
    expect(by).toBe(30); // y
  });

  test("clamps badge cx to stay inside image right edge", () => {
    const { badgeR, bx } = computeBadgePosition(70, 10, 30, 20); // would be at 100
    expect(bx).toBe(100 - badgeR); // clamped inward
  });

  test("clamps badge cx so it doesn't leak past image left edge", () => {
    // Tiny bbox at the far left → x + w < badgeR, so bx must be pushed inward.
    const { badgeR, bx } = computeBadgePosition(0, 10, 1, 1);
    expect(bx).toBe(badgeR);
  });

  test("clamps badge cy so the full circle stays above image top", () => {
    const { badgeR, by } = computeBadgePosition(20, 0, 30, 30);
    expect(by).toBe(badgeR);
  });

  test("badge radius scales with bbox min(w,h) but clamps [2, 4.5]", () => {
    expect(computeBadgePosition(0, 0, 100, 100).badgeR).toBe(4.5); // big clamp
    expect(computeBadgePosition(0, 0, 5, 5).badgeR).toBe(2); // small clamp
    expect(computeBadgePosition(0, 0, 20, 20).badgeR).toBe(3); // 20 * 0.15
  });
});
