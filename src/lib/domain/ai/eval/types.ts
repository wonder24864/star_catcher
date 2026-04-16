/**
 * EvalFramework types — Sprint 16 US-058.
 *
 * Design decisions:
 * - Per-AIOperationType dataset file loaded at runtime.
 * - Exact-match fields deep-equal; mismatch = FAIL (short-circuit, no AI judge).
 * - Judged fields invoke EVAL_JUDGE AI op; score >= 3 = PASS.
 * - SKIPPED does not count toward pass-rate denominator.
 * - ERROR (provider/infra exception) does not count toward failure rate either.
 *
 * See docs/user-stories/admin-phase3.md US-058.
 */
import type { AIOperationType } from "@prisma/client";

export type EvalCaseStatus = "PASS" | "FAIL" | "ERROR" | "SKIPPED";
export type EvalRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

/**
 * One golden dataset entry. `input` is the operation's params bag;
 * `expected` holds the fields we want to compare (subset of schema output).
 */
export interface EvalCaseSpec {
  id: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  locale?: string;
  /**
   * Free-form note for human dataset maintainers (e.g. "synthetic",
   * "covers edge-case X"). Not persisted to EvalCase rows and not shown in
   * the admin UI — purely in-JSON documentation. Intentional (Rule 8 trace):
   * these notes target file reviewers, not runtime observers.
   */
  note?: string;
}

/**
 * Dataset file shape. Either `cases[]` is non-empty, or `unavailableReason`
 * is present (for stubs and pending-fixture operations). The loader rejects
 * any file that has neither.
 */
export interface EvalDataset {
  operation: AIOperationType;
  version: string;
  promptVersion?: string;
  /** Field paths (dot notation) in `expected` to deep-equal against `actual`. */
  exactMatchFields: string[];
  /** Field paths in `expected` to send to EVAL_JUDGE for AI scoring. */
  judgedFields: string[];
  cases: EvalCaseSpec[];
  unavailableReason?: string;
}

/**
 * Single-case evaluation outcome produced by EvalRunner.
 * Persisted as one EvalCase row.
 */
export interface EvalCaseResult {
  operation: AIOperationType;
  caseId: string;
  status: EvalCaseStatus;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
  actual?: Record<string, unknown>;
  judgeScore?: number;
  judgeReasoning?: string;
  failureReason?: string;
  durationMs: number;
}

/**
 * Aggregate result for a full EvalRun.
 * Persisted as one EvalRun row plus N EvalCase rows.
 */
export interface EvalRunResult {
  runId: string;
  status: EvalRunStatus;
  operations: AIOperationType[];
  totalCases: number;
  passedCases: number;
  failedCases: number;
  erroredCases: number;
  skippedCases: number;
  /** passed / (total - skipped). null when no evaluable case. */
  passRate: number | null;
  cases: EvalCaseResult[];
  note?: string;
}
