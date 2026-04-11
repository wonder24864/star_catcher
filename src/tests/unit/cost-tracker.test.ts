/**
 * Unit Tests: CostTracker
 *
 * Verifies token accumulation, budget enforcement, boundary conditions,
 * and pre-flight estimation.
 */
import { describe, test, expect } from "vitest";
import { CostTracker } from "@/lib/domain/agent/cost-tracker";

describe("CostTracker", () => {
  // ── Construction ──

  test("accepts valid budget", () => {
    const tracker = new CostTracker(10000);
    expect(tracker.tokenBudget).toBe(10000);
    expect(tracker.totalConsumed).toBe(0);
  });

  test("throws on budget < 1", () => {
    expect(() => new CostTracker(0)).toThrow("must be ≥ 1");
    expect(() => new CostTracker(-100)).toThrow("must be ≥ 1");
  });

  // ── check() ──

  test("check() returns allowed=true when under budget", () => {
    const tracker = new CostTracker(10000);
    const result = tracker.check();
    expect(result.allowed).toBe(true);
    expect(result.totalConsumed).toBe(0);
    expect(result.budget).toBe(10000);
    expect(result.remaining).toBe(10000);
  });

  test("check() does not consume tokens", () => {
    const tracker = new CostTracker(10000);
    tracker.check();
    tracker.check();
    expect(tracker.totalConsumed).toBe(0);
  });

  // ── record() ──

  test("record() accumulates input and output tokens", () => {
    const tracker = new CostTracker(10000);
    tracker.record({ inputTokens: 200, outputTokens: 100 });
    expect(tracker.totalConsumed).toBe(300);
    expect(tracker.usage.inputTokens).toBe(200);
    expect(tracker.usage.outputTokens).toBe(100);
  });

  test("record() accumulates across multiple calls", () => {
    const tracker = new CostTracker(10000);
    tracker.record({ inputTokens: 200, outputTokens: 100 });
    tracker.record({ inputTokens: 300, outputTokens: 150 });
    tracker.record({ inputTokens: 100, outputTokens: 50 });
    expect(tracker.totalConsumed).toBe(900);
    expect(tracker.usage.inputTokens).toBe(600);
    expect(tracker.usage.outputTokens).toBe(300);
  });

  test("record() returns updated check after recording", () => {
    const tracker = new CostTracker(1000);
    const result = tracker.record({ inputTokens: 400, outputTokens: 200 });
    expect(result.totalConsumed).toBe(600);
    expect(result.remaining).toBe(400);
    expect(result.allowed).toBe(true);
  });

  // ── Budget exhaustion ──

  test("marks allowed=false when budget is exactly met", () => {
    const tracker = new CostTracker(500);
    tracker.record({ inputTokens: 300, outputTokens: 200 });
    const result = tracker.check();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.totalConsumed).toBe(500);
  });

  test("marks allowed=false when budget is exceeded", () => {
    const tracker = new CostTracker(500);
    tracker.record({ inputTokens: 300, outputTokens: 300 });
    const result = tracker.check();
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.totalConsumed).toBe(600);
  });

  // ── wouldExceed() ──

  test("wouldExceed() returns false when within budget", () => {
    const tracker = new CostTracker(1000);
    tracker.record({ inputTokens: 200, outputTokens: 100 });
    expect(tracker.wouldExceed(500)).toBe(false);
  });

  test("wouldExceed() returns true when it would go over", () => {
    const tracker = new CostTracker(1000);
    tracker.record({ inputTokens: 400, outputTokens: 300 });
    expect(tracker.wouldExceed(400)).toBe(true);
  });

  test("wouldExceed() returns true at exact boundary", () => {
    const tracker = new CostTracker(1000);
    tracker.record({ inputTokens: 500, outputTokens: 200 });
    // 700 + 301 = 1001 > 1000
    expect(tracker.wouldExceed(301)).toBe(true);
    // 700 + 300 = 1000, not > 1000
    expect(tracker.wouldExceed(300)).toBe(false);
  });

  test("wouldExceed() does not consume tokens", () => {
    const tracker = new CostTracker(1000);
    tracker.wouldExceed(500);
    expect(tracker.totalConsumed).toBe(0);
  });

  // ── Boundary: exactly at budget ──

  test("boundary: record exactly to budget then check", () => {
    const tracker = new CostTracker(100);
    tracker.record({ inputTokens: 50, outputTokens: 50 });
    expect(tracker.check().allowed).toBe(false);
    expect(tracker.check().remaining).toBe(0);
  });

  test("boundary: record just under budget remains allowed", () => {
    const tracker = new CostTracker(100);
    tracker.record({ inputTokens: 50, outputTokens: 49 });
    expect(tracker.check().allowed).toBe(true);
    expect(tracker.check().remaining).toBe(1);
  });

  // ── reset() ──

  test("reset() clears all consumed tokens", () => {
    const tracker = new CostTracker(1000);
    tracker.record({ inputTokens: 500, outputTokens: 300 });
    tracker.reset();
    expect(tracker.totalConsumed).toBe(0);
    expect(tracker.usage.inputTokens).toBe(0);
    expect(tracker.usage.outputTokens).toBe(0);
    expect(tracker.check().allowed).toBe(true);
    expect(tracker.check().remaining).toBe(1000);
  });

  // ── usage returns a copy ──

  test("usage returns a defensive copy", () => {
    const tracker = new CostTracker(1000);
    tracker.record({ inputTokens: 100, outputTokens: 50 });
    const usage1 = tracker.usage;
    tracker.record({ inputTokens: 200, outputTokens: 100 });
    const usage2 = tracker.usage;
    // Original copy should not have been mutated
    expect(usage1.inputTokens).toBe(100);
    expect(usage2.inputTokens).toBe(300);
  });

  // ── Integration: multi-step budget tracking ──

  test("tracks budget across a realistic multi-step scenario", () => {
    const tracker = new CostTracker(5000);

    // Round 1: AI call
    tracker.record({ inputTokens: 500, outputTokens: 200 });
    expect(tracker.check().allowed).toBe(true);

    // Round 2: AI call
    tracker.record({ inputTokens: 800, outputTokens: 300 });
    expect(tracker.check().allowed).toBe(true);
    expect(tracker.totalConsumed).toBe(1800);

    // Round 3: AI call
    tracker.record({ inputTokens: 1200, outputTokens: 500 });
    expect(tracker.check().allowed).toBe(true);
    expect(tracker.totalConsumed).toBe(3500);

    // Round 4: would this exceed?
    expect(tracker.wouldExceed(2000)).toBe(true);
    expect(tracker.wouldExceed(1500)).toBe(false);

    // Round 4: actual call
    tracker.record({ inputTokens: 1000, outputTokens: 600 });
    expect(tracker.totalConsumed).toBe(5100);
    expect(tracker.check().allowed).toBe(false);
  });
});
