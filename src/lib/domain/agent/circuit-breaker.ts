/**
 * CircuitBreaker — protects AI calls with failure detection and provider fallback.
 *
 * State machine: CLOSED → OPEN → HALF_OPEN → CLOSED (or back to OPEN)
 *
 *   CLOSED:    Normal operation. Failures increment counter.
 *              When consecutive failures hit threshold → OPEN.
 *   OPEN:      All calls rejected immediately (fail-fast).
 *              After resetTimeout elapses → HALF_OPEN.
 *   HALF_OPEN: One probe call allowed.
 *              If it succeeds → CLOSED (reset failures).
 *              If it fails → OPEN (restart timeout).
 *
 * Multi-provider fallback: when the primary provider trips the breaker,
 * the caller can query state and switch to a fallback provider.
 *
 * See: docs/sprints/sprint-4b.md Task 45
 */

// ─── Types ──────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerConfig {
  /** Consecutive failures before opening the circuit (default: 3) */
  failureThreshold: number;
  /** Time in ms before transitioning OPEN → HALF_OPEN (default: 30_000) */
  resetTimeoutMs: number;
  /** Optional name for logging/identification */
  name?: string;
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  consecutiveFailures: number;
  failureThreshold: number;
  resetTimeoutMs: number;
  /** When the circuit was opened (null if never opened) */
  lastOpenedAt: number | null;
  /** When the circuit will transition to HALF_OPEN (null if not OPEN) */
  nextRetryAt: number | null;
  name: string;
}

/** Result of attempting to execute through the breaker */
export type CircuitBreakerResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error; rejected: boolean };

// ─── Default config ─────────────────────────────

const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 3,
  resetTimeoutMs: 30_000,
  name: "default",
};

// ─── CircuitBreaker ─────────────────────────────

export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private lastOpenedAt: number | null = null;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  readonly name: string;

  /** Injectable clock for testing (returns epoch ms) */
  private readonly now: () => number;

  constructor(
    config: Partial<CircuitBreakerConfig> = {},
    clock?: () => number,
  ) {
    const merged = { ...DEFAULT_CONFIG, ...config };
    if (merged.failureThreshold < 1) {
      throw new Error(
        `failureThreshold must be ≥ 1, got ${merged.failureThreshold}`,
      );
    }
    if (merged.resetTimeoutMs < 0) {
      throw new Error(
        `resetTimeoutMs must be ≥ 0, got ${merged.resetTimeoutMs}`,
      );
    }
    this.failureThreshold = merged.failureThreshold;
    this.resetTimeoutMs = merged.resetTimeoutMs;
    this.name = merged.name;
    this.now = clock ?? Date.now;
  }

  /**
   * Execute `fn` through the circuit breaker.
   *
   * - CLOSED / HALF_OPEN: executes fn; success → CLOSED, failure → maybe OPEN
   * - OPEN (timeout not elapsed): rejects immediately (rejected: true)
   * - OPEN (timeout elapsed): transitions to HALF_OPEN and runs probe call
   */
  async execute<T>(fn: () => Promise<T>): Promise<CircuitBreakerResult<T>> {
    // Attempt state transition OPEN → HALF_OPEN if timeout elapsed
    this.maybeTransitionToHalfOpen();

    if (this.state === "OPEN") {
      return {
        ok: false,
        error: new Error(
          `CircuitBreaker "${this.name}" is OPEN — call rejected`,
        ),
        rejected: true,
      };
    }

    try {
      const value = await fn();
      this.recordSuccess();
      return { ok: true, value };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.recordFailure();
      return { ok: false, error, rejected: false };
    }
  }

  /**
   * Check whether a call would be allowed right now (non-mutating peek).
   * For pre-flight checks before constructing expensive request payloads.
   */
  canExecute(): boolean {
    this.maybeTransitionToHalfOpen();
    return this.state !== "OPEN";
  }

  /** Current breaker status (for monitoring / logging) */
  getStatus(): CircuitBreakerStatus {
    this.maybeTransitionToHalfOpen();
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      failureThreshold: this.failureThreshold,
      resetTimeoutMs: this.resetTimeoutMs,
      lastOpenedAt: this.lastOpenedAt,
      nextRetryAt:
        this.state === "OPEN" && this.lastOpenedAt !== null
          ? this.lastOpenedAt + this.resetTimeoutMs
          : null,
      name: this.name,
    };
  }

  /** Force the breaker to a specific state (for testing / admin override) */
  forceState(state: CircuitState): void {
    this.state = state;
    if (state === "CLOSED") {
      this.consecutiveFailures = 0;
    }
    if (state === "OPEN") {
      this.lastOpenedAt = this.now();
    }
  }

  /** Reset to initial CLOSED state */
  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.lastOpenedAt = null;
  }

  // ─── State transitions (public for external execution patterns) ──

  /**
   * Record a successful call. Resets consecutive failures.
   * In HALF_OPEN state, closes the circuit.
   * Use when the caller manages execution outside `execute()`.
   */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    if (this.state === "HALF_OPEN") {
      this.state = "CLOSED";
    }
  }

  /**
   * Record a failed call. Increments failure counter.
   * In HALF_OPEN, reopens the circuit. In CLOSED, trips if threshold reached.
   * Use when the caller manages execution outside `execute()`.
   */
  recordFailure(): void {
    this.consecutiveFailures++;

    if (this.state === "HALF_OPEN") {
      this.trip();
      return;
    }

    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = "OPEN";
    this.lastOpenedAt = this.now();
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state !== "OPEN" || this.lastOpenedAt === null) return;
    if (this.now() - this.lastOpenedAt >= this.resetTimeoutMs) {
      this.state = "HALF_OPEN";
    }
  }
}

// ─── Multi-Provider CircuitBreaker Manager ──────

export interface ProviderCircuitConfig {
  /** Provider identifier (e.g. "azure-openai", "anthropic", "ollama") */
  provider: string;
  /** Per-provider breaker config (overrides defaults) */
  breakerConfig?: Partial<CircuitBreakerConfig>;
  /** Lower number = higher priority (0 = primary) */
  priority: number;
}

export interface ProviderFallbackResult {
  /** The provider that should handle the call */
  provider: string;
  /** Whether this is a fallback (not the primary) */
  isFallback: boolean;
  /** All provider statuses */
  statuses: Array<{ provider: string } & CircuitBreakerStatus>;
}

/**
 * Manages circuit breakers for multiple AI providers.
 * Selects the highest-priority available provider, falling back to
 * lower-priority ones when the primary is tripped.
 */
export class ProviderCircuitManager {
  private readonly breakers: Map<string, CircuitBreaker> = new Map();
  private readonly priorities: Map<string, number> = new Map();

  constructor(
    providers: ProviderCircuitConfig[],
    clock?: () => number,
  ) {
    if (providers.length === 0) {
      throw new Error("At least one provider is required");
    }
    for (const p of providers) {
      this.breakers.set(
        p.provider,
        new CircuitBreaker(
          { ...p.breakerConfig, name: p.provider },
          clock,
        ),
      );
      this.priorities.set(p.provider, p.priority);
    }
  }

  /**
   * Select the best available provider.
   * Returns the highest-priority provider whose breaker allows execution.
   * Returns null if ALL providers are open-circuited.
   */
  selectProvider(): ProviderFallbackResult | null {
    const sorted = [...this.priorities.entries()]
      .sort(([, a], [, b]) => a - b);

    const statuses = this.getAllStatuses();
    const primaryProvider = sorted[0]![0];

    for (const [provider] of sorted) {
      const breaker = this.breakers.get(provider)!;
      if (breaker.canExecute()) {
        return {
          provider,
          isFallback: provider !== primaryProvider,
          statuses,
        };
      }
    }

    return null; // All providers tripped
  }

  /**
   * Record a success for a provider's breaker.
   */
  recordSuccess(provider: string): void {
    this.getBreaker(provider).recordSuccess();
  }

  /**
   * Record a failure for a provider's breaker.
   */
  recordFailure(provider: string): void {
    this.getBreaker(provider).recordFailure();
  }

  /**
   * Execute through the named provider's breaker.
   * Preferred over recordSuccess/recordFailure for cleaner state management.
   */
  async execute<T>(
    provider: string,
    fn: () => Promise<T>,
  ): Promise<CircuitBreakerResult<T>> {
    return this.getBreaker(provider).execute(fn);
  }

  /**
   * Execute with automatic fallback: tries providers in priority order
   * until one succeeds or all are exhausted.
   */
  async executeWithFallback<T>(
    fn: (provider: string) => Promise<T>,
  ): Promise<CircuitBreakerResult<T> & { provider: string }> {
    const sorted = [...this.priorities.entries()]
      .sort(([, a], [, b]) => a - b);

    for (const [provider] of sorted) {
      const breaker = this.breakers.get(provider)!;
      if (!breaker.canExecute()) continue;

      const result = await breaker.execute(() => fn(provider));
      if (result.ok) {
        return { ...result, provider };
      }
      // Failed — try next provider
    }

    return {
      ok: false,
      error: new Error("All providers exhausted — circuit breakers open"),
      rejected: true,
      provider: sorted[0]![0],
    };
  }

  /** Get breaker for a specific provider */
  getBreaker(provider: string): CircuitBreaker {
    const breaker = this.breakers.get(provider);
    if (!breaker) {
      throw new Error(`Unknown provider: "${provider}"`);
    }
    return breaker;
  }

  /** Get status of all provider breakers */
  getAllStatuses(): Array<{ provider: string } & CircuitBreakerStatus> {
    return [...this.breakers.entries()]
      .map(([provider, breaker]) => ({
        provider,
        ...breaker.getStatus(),
      }))
      .sort((a, b) => (this.priorities.get(a.provider) ?? 0) - (this.priorities.get(b.provider) ?? 0));
  }

  /** Reset all breakers */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}
