/**
 * CostTracker — tracks token consumption and enforces budget limits.
 *
 * Accumulates input/output tokens across an Agent run and blocks
 * further AI calls when the budget is exhausted.
 *
 * Token sources:
 *   - AI provider responses (from FunctionCallingResponse.usage)
 *   - Skill-internal AI calls (via IPC harness.call — future TODO)
 *
 * See: docs/adr/008-agent-architecture.md §5
 */
import type { AIUsage } from "../ai/types";

export interface CostBudgetCheck {
  /** Whether another AI call is allowed within budget */
  allowed: boolean;
  /** Tokens consumed so far */
  consumed: AIUsage;
  /** Total combined tokens (input + output) */
  totalConsumed: number;
  /** Budget limit (combined tokens) */
  budget: number;
  /** Remaining budget (0 when exhausted) */
  remaining: number;
}

export class CostTracker {
  private readonly budget: number;
  private consumed: AIUsage = { inputTokens: 0, outputTokens: 0 };

  /**
   * @param maxTokens - Total token budget (input + output combined)
   */
  constructor(maxTokens: number) {
    if (maxTokens < 1) {
      throw new Error(`maxTokens must be ≥ 1, got ${maxTokens}`);
    }
    this.budget = maxTokens;
  }

  /**
   * Check whether another call is within budget WITHOUT consuming.
   */
  check(): CostBudgetCheck {
    const total = this.consumed.inputTokens + this.consumed.outputTokens;
    return {
      allowed: total < this.budget,
      consumed: { ...this.consumed },
      totalConsumed: total,
      budget: this.budget,
      remaining: Math.max(0, this.budget - total),
    };
  }

  /**
   * Record token usage from an AI call.
   * Returns the check result AFTER recording.
   */
  record(usage: AIUsage): CostBudgetCheck {
    this.consumed.inputTokens += usage.inputTokens;
    this.consumed.outputTokens += usage.outputTokens;
    return this.check();
  }

  /**
   * Check whether a given usage would exceed the budget (pre-flight check).
   * Does NOT consume — use record() after the actual call.
   *
   * @param estimatedTokens - Estimated total tokens for the next call
   */
  wouldExceed(estimatedTokens: number): boolean {
    const current =
      this.consumed.inputTokens + this.consumed.outputTokens;
    return current + estimatedTokens > this.budget;
  }

  /** Reset tracker (typically create a new instance per agent run). */
  reset(): void {
    this.consumed = { inputTokens: 0, outputTokens: 0 };
  }

  /** Current total consumed tokens */
  get totalConsumed(): number {
    return this.consumed.inputTokens + this.consumed.outputTokens;
  }

  /** Current usage breakdown */
  get usage(): Readonly<AIUsage> {
    return { ...this.consumed };
  }

  /** The budget limit */
  get tokenBudget(): number {
    return this.budget;
  }
}
