/**
 * AgentStepLimiter — enforces maximum function-call step count.
 *
 * Tracks the number of tool calls executed by an Agent run and
 * blocks further execution when the limit is reached.
 *
 * ADR-008 constraint: maxSteps ≤ 10 (hard upper bound).
 *
 * See: docs/adr/008-agent-architecture.md §4
 */

/** Hard upper bound — no agent may exceed this regardless of definition */
const ABSOLUTE_MAX_STEPS = 10;

export interface StepLimitCheck {
  /** Whether the agent may execute another step */
  allowed: boolean;
  /** Steps consumed so far */
  current: number;
  /** Maximum steps allowed */
  limit: number;
  /** Steps remaining (0 when blocked) */
  remaining: number;
}

export class AgentStepLimiter {
  private readonly limit: number;
  private current = 0;

  /**
   * @param maxSteps - Agent-defined step limit (clamped to ABSOLUTE_MAX_STEPS)
   */
  constructor(maxSteps: number) {
    if (maxSteps < 1) {
      throw new Error(`maxSteps must be ≥ 1, got ${maxSteps}`);
    }
    this.limit = Math.min(maxSteps, ABSOLUTE_MAX_STEPS);
  }

  /**
   * Check whether another step is allowed WITHOUT consuming it.
   */
  check(): StepLimitCheck {
    return {
      allowed: this.current < this.limit,
      current: this.current,
      limit: this.limit,
      remaining: Math.max(0, this.limit - this.current),
    };
  }

  /**
   * Consume one step. Returns the check result AFTER consumption.
   * Throws if the limit has already been reached.
   */
  consume(): StepLimitCheck {
    if (this.current >= this.limit) {
      throw new Error(
        `Step limit reached: ${this.current}/${this.limit}`,
      );
    }
    this.current++;
    return this.check();
  }

  /**
   * Consume N steps at once (e.g. parallel tool calls).
   * Returns the check result AFTER consumption.
   * Throws if consumption would exceed the limit.
   */
  consumeMany(count: number): StepLimitCheck {
    if (count < 1) {
      throw new Error(`count must be ≥ 1, got ${count}`);
    }
    if (this.current + count > this.limit) {
      throw new Error(
        `Step limit would be exceeded: ${this.current} + ${count} > ${this.limit}`,
      );
    }
    this.current += count;
    return this.check();
  }

  /** Reset counter (for reuse across runs — typically create a new instance). */
  reset(): void {
    this.current = 0;
  }

  /** Current step count */
  get stepCount(): number {
    return this.current;
  }

  /** The effective limit (may be lower than requested due to ABSOLUTE_MAX_STEPS) */
  get effectiveLimit(): number {
    return this.limit;
  }
}
