/**
 * Unit Tests: CircuitBreaker + ProviderCircuitManager
 *
 * Verifies state machine transitions (CLOSED → OPEN → HALF_OPEN → CLOSED),
 * failure counting, timeout-based recovery, multi-provider fallback,
 * and edge cases.
 */
import { describe, test, expect } from "vitest";
import {
  CircuitBreaker,
  ProviderCircuitManager,
} from "@/lib/domain/agent/circuit-breaker";

// ─── Helpers ──────────────────────────────────

/** Creates a controllable clock starting at `start` (default 0) */
function fakeClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => { time += ms; },
    set: (ms: number) => { time = ms; },
  };
}

const fail = () => Promise.reject(new Error("boom"));
const succeed = () => Promise.resolve("ok");

// ─── CircuitBreaker Core ────────────────────

describe("CircuitBreaker", () => {
  // ── Construction ──

  test("starts in CLOSED state with zero failures", () => {
    const cb = new CircuitBreaker();
    const status = cb.getStatus();
    expect(status.state).toBe("CLOSED");
    expect(status.consecutiveFailures).toBe(0);
    expect(status.lastOpenedAt).toBeNull();
  });

  test("applies defaults when no config given", () => {
    const cb = new CircuitBreaker();
    const status = cb.getStatus();
    expect(status.failureThreshold).toBe(3);
    expect(status.resetTimeoutMs).toBe(30_000);
    expect(status.name).toBe("default");
  });

  test("accepts custom config", () => {
    const cb = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
      name: "azure",
    });
    const status = cb.getStatus();
    expect(status.failureThreshold).toBe(5);
    expect(status.resetTimeoutMs).toBe(60_000);
    expect(status.name).toBe("azure");
  });

  test("throws on failureThreshold < 1", () => {
    expect(() => new CircuitBreaker({ failureThreshold: 0 }))
      .toThrow("must be ≥ 1");
  });

  test("throws on negative resetTimeoutMs", () => {
    expect(() => new CircuitBreaker({ resetTimeoutMs: -1 }))
      .toThrow("must be ≥ 0");
  });

  // ── CLOSED → OPEN (failure counting) ──

  test("stays CLOSED when failures < threshold", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    await cb.execute(fail); // failure 1
    await cb.execute(fail); // failure 2

    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().consecutiveFailures).toBe(2);
  });

  test("transitions CLOSED → OPEN at exact threshold", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    await cb.execute(fail);
    await cb.execute(fail);
    await cb.execute(fail); // 3rd failure → OPEN

    expect(cb.getStatus().state).toBe("OPEN");
  });

  test("success resets consecutive failure count", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    await cb.execute(fail);
    await cb.execute(fail);
    await cb.execute(succeed); // resets
    await cb.execute(fail);

    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().consecutiveFailures).toBe(1);
  });

  // ── OPEN behavior ──

  test("OPEN state rejects calls immediately", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });

    await cb.execute(fail); // → OPEN

    const result = await cb.execute(succeed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected).toBe(true);
      expect(result.error.message).toContain("OPEN");
    }
  });

  test("canExecute() returns false when OPEN", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await cb.execute(fail);
    expect(cb.canExecute()).toBe(false);
  });

  test("OPEN status includes lastOpenedAt and nextRetryAt", async () => {
    const clock = fakeClock(1000);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 5000 },
      clock.now,
    );

    await cb.execute(fail); // opens at t=1000

    const status = cb.getStatus();
    expect(status.lastOpenedAt).toBe(1000);
    expect(status.nextRetryAt).toBe(6000);
  });

  // ── OPEN → HALF_OPEN (timeout) ──

  test("transitions OPEN → HALF_OPEN after resetTimeout", async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 5000 },
      clock.now,
    );

    await cb.execute(fail); // → OPEN at t=0
    expect(cb.getStatus().state).toBe("OPEN");

    clock.advance(4999);
    expect(cb.getStatus().state).toBe("OPEN"); // not yet

    clock.advance(1); // t=5000
    expect(cb.getStatus().state).toBe("HALF_OPEN");
  });

  test("canExecute() returns true in HALF_OPEN", async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 100 },
      clock.now,
    );

    await cb.execute(fail);
    clock.advance(100);
    expect(cb.canExecute()).toBe(true);
  });

  // ── HALF_OPEN → CLOSED (probe success) ──

  test("HALF_OPEN probe success → CLOSED", async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 100 },
      clock.now,
    );

    await cb.execute(fail); // → OPEN
    clock.advance(100);     // → HALF_OPEN

    const result = await cb.execute(succeed);
    expect(result.ok).toBe(true);
    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().consecutiveFailures).toBe(0);
  });

  // ── HALF_OPEN → OPEN (probe failure) ──

  test("HALF_OPEN probe failure → OPEN again", async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 100 },
      clock.now,
    );

    await cb.execute(fail); // → OPEN at t=0
    clock.advance(100);     // → HALF_OPEN

    await cb.execute(fail); // probe fails → OPEN at t=100

    const status = cb.getStatus();
    expect(status.state).toBe("OPEN");
    expect(status.lastOpenedAt).toBe(100);
  });

  // ── execute() return values ──

  test("execute returns { ok: true, value } on success", async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toEqual({ ok: true, value: 42 });
  });

  test("execute returns { ok: false, error, rejected: false } on fn error", async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(fail);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejected).toBe(false);
      expect(result.error.message).toBe("boom");
    }
  });

  test("execute wraps non-Error throws", async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(() => Promise.reject("string error"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error.message).toBe("string error");
    }
  });

  // ── recordSuccess / recordFailure (manual recording) ──

  test("recordFailure increments and trips at threshold", () => {
    const cb = new CircuitBreaker({ failureThreshold: 2 });
    cb.recordFailure();
    expect(cb.getStatus().state).toBe("CLOSED");
    cb.recordFailure();
    expect(cb.getStatus().state).toBe("OPEN");
  });

  test("recordSuccess resets failure count", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.recordSuccess();
    expect(cb.getStatus().consecutiveFailures).toBe(0);
    expect(cb.getStatus().state).toBe("CLOSED");
  });

  test("recordSuccess in HALF_OPEN closes circuit", () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 100 },
      clock.now,
    );
    cb.recordFailure(); // → OPEN
    clock.advance(100);
    cb.canExecute(); // trigger HALF_OPEN transition
    expect(cb.getStatus().state).toBe("HALF_OPEN");
    cb.recordSuccess();
    expect(cb.getStatus().state).toBe("CLOSED");
  });

  test("recordFailure in HALF_OPEN reopens circuit", () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 100 },
      clock.now,
    );
    cb.recordFailure(); // → OPEN
    clock.advance(100);
    cb.canExecute(); // trigger HALF_OPEN
    cb.recordFailure(); // → OPEN
    expect(cb.getStatus().state).toBe("OPEN");
  });

  // ── forceState / reset ──

  test("forceState sets state and clears failures when CLOSED", () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });
    cb.recordFailure();
    cb.recordFailure();
    cb.forceState("CLOSED");
    expect(cb.getStatus().consecutiveFailures).toBe(0);
    expect(cb.getStatus().state).toBe("CLOSED");
  });

  test("forceState OPEN records lastOpenedAt", () => {
    const clock = fakeClock(5000);
    const cb = new CircuitBreaker({}, clock.now);
    cb.forceState("OPEN");
    expect(cb.getStatus().lastOpenedAt).toBe(5000);
  });

  test("reset() restores initial state", async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    await cb.execute(fail); // → OPEN
    cb.reset();
    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().consecutiveFailures).toBe(0);
    expect(cb.getStatus().lastOpenedAt).toBeNull();
  });

  // ── Full cycle: CLOSED → OPEN → HALF_OPEN → CLOSED ──

  test("full state machine cycle", async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 2, resetTimeoutMs: 1000 },
      clock.now,
    );

    // CLOSED
    expect(cb.getStatus().state).toBe("CLOSED");

    // Two failures → OPEN
    await cb.execute(fail);
    await cb.execute(fail);
    expect(cb.getStatus().state).toBe("OPEN");

    // Wait for timeout → HALF_OPEN
    clock.advance(1000);
    expect(cb.getStatus().state).toBe("HALF_OPEN");

    // Probe succeeds → CLOSED
    await cb.execute(succeed);
    expect(cb.getStatus().state).toBe("CLOSED");
    expect(cb.getStatus().consecutiveFailures).toBe(0);
  });

  test("full cycle with probe failure (HALF_OPEN → OPEN → HALF_OPEN → CLOSED)", async () => {
    const clock = fakeClock(0);
    const cb = new CircuitBreaker(
      { failureThreshold: 1, resetTimeoutMs: 500 },
      clock.now,
    );

    await cb.execute(fail); // → OPEN at t=0

    clock.advance(500);     // → HALF_OPEN
    await cb.execute(fail); // → OPEN at t=500

    clock.advance(500);     // → HALF_OPEN at t=1000
    const result = await cb.execute(succeed); // → CLOSED
    expect(result.ok).toBe(true);
    expect(cb.getStatus().state).toBe("CLOSED");
  });
});

// ─── ProviderCircuitManager ─────────────────

describe("ProviderCircuitManager", () => {
  const clock = fakeClock(0);

  function createManager(opts?: { resetTimeoutMs?: number }) {
    clock.set(0);
    return new ProviderCircuitManager(
      [
        {
          provider: "azure-openai",
          priority: 0,
          breakerConfig: {
            failureThreshold: 2,
            resetTimeoutMs: opts?.resetTimeoutMs ?? 1000,
          },
        },
        {
          provider: "anthropic",
          priority: 1,
          breakerConfig: {
            failureThreshold: 2,
            resetTimeoutMs: opts?.resetTimeoutMs ?? 1000,
          },
        },
        {
          provider: "ollama",
          priority: 2,
          breakerConfig: {
            failureThreshold: 2,
            resetTimeoutMs: opts?.resetTimeoutMs ?? 1000,
          },
        },
      ],
      clock.now,
    );
  }

  // ── Construction ──

  test("throws if no providers given", () => {
    expect(() => new ProviderCircuitManager([])).toThrow("At least one");
  });

  test("creates breakers for all providers", () => {
    const mgr = createManager();
    const statuses = mgr.getAllStatuses();
    expect(statuses).toHaveLength(3);
    expect(statuses[0]!.provider).toBe("azure-openai");
    expect(statuses[1]!.provider).toBe("anthropic");
    expect(statuses[2]!.provider).toBe("ollama");
  });

  // ── selectProvider ──

  test("selects primary provider when all healthy", () => {
    const mgr = createManager();
    const result = mgr.selectProvider();
    expect(result).not.toBeNull();
    expect(result!.provider).toBe("azure-openai");
    expect(result!.isFallback).toBe(false);
  });

  test("falls back to second provider when primary is open", () => {
    const mgr = createManager();
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("azure-openai"); // → OPEN

    const result = mgr.selectProvider();
    expect(result!.provider).toBe("anthropic");
    expect(result!.isFallback).toBe(true);
  });

  test("falls back to third provider when first two are open", () => {
    const mgr = createManager();
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("anthropic");
    mgr.recordFailure("anthropic");

    const result = mgr.selectProvider();
    expect(result!.provider).toBe("ollama");
    expect(result!.isFallback).toBe(true);
  });

  test("returns null when all providers are open", () => {
    const mgr = createManager();
    for (const p of ["azure-openai", "anthropic", "ollama"]) {
      mgr.recordFailure(p);
      mgr.recordFailure(p);
    }
    expect(mgr.selectProvider()).toBeNull();
  });

  // ── execute ──

  test("execute routes through named provider breaker", async () => {
    const mgr = createManager();
    const result = await mgr.execute("azure-openai", succeed);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe("ok");
  });

  test("execute rejects when provider breaker is OPEN", async () => {
    const mgr = createManager();
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("azure-openai");

    const result = await mgr.execute("azure-openai", succeed);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rejected).toBe(true);
  });

  // ── executeWithFallback ──

  test("executeWithFallback uses primary when healthy", async () => {
    const mgr = createManager();
    const result = await mgr.executeWithFallback((provider) =>
      Promise.resolve(provider),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("azure-openai");
      expect(result.provider).toBe("azure-openai");
    }
  });

  test("executeWithFallback falls back on primary failure", async () => {
    const mgr = createManager();
    const result = await mgr.executeWithFallback((provider) => {
      if (provider === "azure-openai") return Promise.reject(new Error("down"));
      return Promise.resolve(provider);
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("anthropic");
      expect(result.provider).toBe("anthropic");
    }
  });

  test("executeWithFallback cascades through all providers", async () => {
    const mgr = createManager();
    const result = await mgr.executeWithFallback((provider) => {
      if (provider !== "ollama") return Promise.reject(new Error("down"));
      return Promise.resolve(provider);
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe("ollama");
      expect(result.provider).toBe("ollama");
    }
  });

  test("executeWithFallback returns error when all fail", async () => {
    const mgr = createManager();
    const result = await mgr.executeWithFallback(() =>
      Promise.reject(new Error("all down")),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("All providers exhausted");
    }
  });

  test("executeWithFallback skips OPEN providers without calling fn", async () => {
    const mgr = createManager();
    // Trip primary
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("azure-openai");

    const calls: string[] = [];
    const result = await mgr.executeWithFallback((provider) => {
      calls.push(provider);
      return Promise.resolve(provider);
    });

    expect(calls).not.toContain("azure-openai");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.provider).toBe("anthropic");
  });

  // ── recordSuccess / recordFailure ──

  test("recordSuccess resets provider failures", () => {
    const mgr = createManager();
    mgr.recordFailure("azure-openai");
    mgr.recordSuccess("azure-openai");
    const status = mgr.getBreaker("azure-openai").getStatus();
    expect(status.consecutiveFailures).toBe(0);
  });

  test("recordFailure trips provider breaker", () => {
    const mgr = createManager();
    mgr.recordFailure("anthropic");
    mgr.recordFailure("anthropic");
    expect(mgr.getBreaker("anthropic").getStatus().state).toBe("OPEN");
  });

  test("throws on unknown provider", () => {
    const mgr = createManager();
    expect(() => mgr.recordFailure("unknown")).toThrow("Unknown provider");
    expect(() => mgr.recordSuccess("unknown")).toThrow("Unknown provider");
    expect(() => mgr.getBreaker("unknown")).toThrow("Unknown provider");
  });

  // ── Recovery after timeout ──

  test("primary recovers after timeout and becomes preferred again", () => {
    const mgr = createManager({ resetTimeoutMs: 1000 });

    // Trip primary
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("azure-openai");
    expect(mgr.selectProvider()!.provider).toBe("anthropic");

    // Advance past timeout
    clock.advance(1000);

    // Primary should be available again (HALF_OPEN)
    const result = mgr.selectProvider();
    expect(result!.provider).toBe("azure-openai");
    expect(result!.isFallback).toBe(false);
  });

  // ── resetAll ──

  test("resetAll clears all provider breakers", () => {
    const mgr = createManager();
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("azure-openai");
    mgr.recordFailure("anthropic");
    mgr.recordFailure("anthropic");

    mgr.resetAll();

    const statuses = mgr.getAllStatuses();
    for (const s of statuses) {
      expect(s.state).toBe("CLOSED");
      expect(s.consecutiveFailures).toBe(0);
    }
  });

  // ── getAllStatuses ──

  test("getAllStatuses returns sorted by priority", () => {
    const mgr = createManager();
    const statuses = mgr.getAllStatuses();
    expect(statuses.map((s) => s.provider)).toEqual([
      "azure-openai",
      "anthropic",
      "ollama",
    ]);
  });
});
