/**
 * Unit Tests: AgentStepLimiter
 *
 * Verifies step counting, limit enforcement, boundary conditions,
 * and the ADR-008 absolute max (≤ 10) constraint.
 */
import { describe, test, expect } from "vitest";
import { AgentStepLimiter } from "@/lib/domain/agent/step-limiter";

describe("AgentStepLimiter", () => {
  // ── Construction ──

  test("accepts valid maxSteps", () => {
    const limiter = new AgentStepLimiter(5);
    expect(limiter.effectiveLimit).toBe(5);
    expect(limiter.stepCount).toBe(0);
  });

  test("clamps maxSteps to absolute max of 10", () => {
    const limiter = new AgentStepLimiter(20);
    expect(limiter.effectiveLimit).toBe(10);
  });

  test("throws on maxSteps < 1", () => {
    expect(() => new AgentStepLimiter(0)).toThrow("must be ≥ 1");
    expect(() => new AgentStepLimiter(-1)).toThrow("must be ≥ 1");
  });

  // ── check() ──

  test("check() returns allowed=true when under limit", () => {
    const limiter = new AgentStepLimiter(3);
    const result = limiter.check();
    expect(result.allowed).toBe(true);
    expect(result.current).toBe(0);
    expect(result.limit).toBe(3);
    expect(result.remaining).toBe(3);
  });

  test("check() does not consume a step", () => {
    const limiter = new AgentStepLimiter(3);
    limiter.check();
    limiter.check();
    limiter.check();
    expect(limiter.stepCount).toBe(0);
  });

  // ── consume() ──

  test("consume() increments step count", () => {
    const limiter = new AgentStepLimiter(5);
    limiter.consume();
    expect(limiter.stepCount).toBe(1);
    limiter.consume();
    expect(limiter.stepCount).toBe(2);
  });

  test("consume() returns updated check after consumption", () => {
    const limiter = new AgentStepLimiter(3);
    const result = limiter.consume();
    expect(result.current).toBe(1);
    expect(result.remaining).toBe(2);
    expect(result.allowed).toBe(true);
  });

  test("consume() at exact limit marks allowed=false", () => {
    const limiter = new AgentStepLimiter(2);
    limiter.consume(); // 1/2
    const result = limiter.consume(); // 2/2
    expect(result.current).toBe(2);
    expect(result.remaining).toBe(0);
    expect(result.allowed).toBe(false);
  });

  test("consume() throws when limit already reached", () => {
    const limiter = new AgentStepLimiter(1);
    limiter.consume();
    expect(() => limiter.consume()).toThrow("Step limit reached: 1/1");
  });

  // ── consumeMany() ──

  test("consumeMany() consumes N steps at once", () => {
    const limiter = new AgentStepLimiter(5);
    const result = limiter.consumeMany(3);
    expect(limiter.stepCount).toBe(3);
    expect(result.remaining).toBe(2);
  });

  test("consumeMany() throws when it would exceed limit", () => {
    const limiter = new AgentStepLimiter(3);
    limiter.consume(); // 1/3
    expect(() => limiter.consumeMany(3)).toThrow("would be exceeded: 1 + 3 > 3");
  });

  test("consumeMany() throws on count < 1", () => {
    const limiter = new AgentStepLimiter(5);
    expect(() => limiter.consumeMany(0)).toThrow("must be ≥ 1");
  });

  // ── Boundary: exactly at limit ──

  test("boundary: consume up to exact limit succeeds", () => {
    const limiter = new AgentStepLimiter(3);
    limiter.consume();
    limiter.consume();
    limiter.consume();
    expect(limiter.stepCount).toBe(3);
    expect(limiter.check().allowed).toBe(false);
    expect(limiter.check().remaining).toBe(0);
  });

  test("boundary: consumeMany to exact limit succeeds", () => {
    const limiter = new AgentStepLimiter(4);
    limiter.consumeMany(4);
    expect(limiter.stepCount).toBe(4);
    expect(limiter.check().allowed).toBe(false);
  });

  // ── reset() ──

  test("reset() clears step count", () => {
    const limiter = new AgentStepLimiter(3);
    limiter.consume();
    limiter.consume();
    limiter.reset();
    expect(limiter.stepCount).toBe(0);
    expect(limiter.check().allowed).toBe(true);
    expect(limiter.check().remaining).toBe(3);
  });

  // ── ADR-008 absolute max ──

  test("ADR-008: absolute max of 10 is enforced even with higher input", () => {
    const limiter = new AgentStepLimiter(100);
    expect(limiter.effectiveLimit).toBe(10);
    // Can consume exactly 10
    for (let i = 0; i < 10; i++) {
      limiter.consume();
    }
    expect(limiter.check().allowed).toBe(false);
    expect(() => limiter.consume()).toThrow();
  });
});
