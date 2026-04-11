/**
 * Student Memory Layer — Type Definitions
 *
 * Defines the mastery state machine, transition rules, and Memory
 * interface that Skill accesses via IPC (ctx.readMemory/ctx.writeMemory).
 *
 * See: docs/adr/010-student-memory-layer.md
 */

// ─── Mastery State Machine ──────────────────────

export type MasteryStatus =
  | "NEW_ERROR"
  | "CORRECTED"
  | "REVIEWING"
  | "MASTERED"
  | "REGRESSED";

/**
 * Legal state transitions — Memory layer validates against this map.
 * Key: current status → Value: set of allowed next statuses.
 */
export const MASTERY_TRANSITIONS: Record<MasteryStatus, Set<MasteryStatus>> =
  {
    NEW_ERROR: new Set(["CORRECTED"]),
    CORRECTED: new Set(["REVIEWING"]),
    REVIEWING: new Set(["MASTERED", "REGRESSED"]),
    MASTERED: new Set(["REGRESSED"]),
    REGRESSED: new Set(["REVIEWING"]),
  };

/**
 * Typed transition request (discriminated by from/to).
 * Memory layer uses this to validate + audit.
 */
export interface MasteryTransition {
  from: MasteryStatus;
  to: MasteryStatus;
  reason: string;
}

// ─── Intervention Types ─────────────────────────

export type InterventionKind =
  | "DIAGNOSIS"
  | "HINT"
  | "REVIEW"
  | "EXPLANATION";

export interface InterventionRecord {
  id: string;
  type: InterventionKind;
  content: unknown;
  agentId: string | null;
  skillId: string | null;
  createdAt: Date;
}

// ─── Memory Layer Interface ─────────────────────

/** Read-view of MasteryState (returned by Memory layer) */
export interface MasteryStateView {
  id: string;
  studentId: string;
  knowledgePointId: string;
  status: MasteryStatus;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: Date | null;
  masteredAt: Date | null;
  version: number;
}

/** Read-view of ReviewSchedule */
export interface ReviewScheduleView {
  id: string;
  studentId: string;
  knowledgePointId: string;
  nextReviewAt: Date;
  intervalDays: number;
  easeFactor: number;
  consecutiveCorrect: number;
}

/** Result of processing a review via SM-2 algorithm */
export interface ReviewResult {
  mastery: MasteryStateView;
  schedule: ReviewScheduleView;
  /** Non-null if a state transition occurred (e.g., REVIEWING→MASTERED) */
  transition: MasteryTransition | null;
}

/**
 * StudentMemory — the interface exposed to Skills via IPC.
 *
 * Skill calls: ctx.readMemory(method, params) / ctx.writeMemory(method, params)
 * Host process routes to the corresponding method here.
 */
export interface StudentMemory {
  // ── Mastery ──
  getMasteryState(
    studentId: string,
    knowledgePointId: string,
  ): Promise<MasteryStateView | null>;

  updateMasteryState(
    studentId: string,
    knowledgePointId: string,
    transition: MasteryTransition,
  ): Promise<MasteryStateView>;

  getWeakPoints(
    studentId: string,
    options?: { subject?: string; limit?: number },
  ): Promise<MasteryStateView[]>;

  // ── Review Scheduling ──
  getNextReviewDate(
    studentId: string,
    knowledgePointId: string,
  ): Promise<Date | null>;

  scheduleReview(
    studentId: string,
    knowledgePointId: string,
    intervalDays: number,
    sm2Params?: { easeFactor: number; consecutiveCorrect: number },
  ): Promise<ReviewScheduleView>;

  getOverdueReviews(studentId: string): Promise<ReviewScheduleView[]>;

  /**
   * Process a review result using SM-2 algorithm.
   * Updates ReviewSchedule, transitions mastery state if needed.
   *
   * @param quality — SM-2 quality rating 0-5
   */
  processReviewResult(
    studentId: string,
    knowledgePointId: string,
    quality: number,
  ): Promise<ReviewResult>;

  // ── Intervention History (append-only) ──
  logIntervention(
    studentId: string,
    knowledgePointId: string,
    type: InterventionKind,
    content: unknown,
    source?: { agentId?: string; skillId?: string },
  ): Promise<InterventionRecord>;

  getInterventionHistory(
    studentId: string,
    knowledgePointId: string,
  ): Promise<InterventionRecord[]>;
}

// ─── Errors ─────────────────────────────────────

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: MasteryStatus,
    public readonly to: MasteryStatus,
  ) {
    super(
      `Invalid mastery transition: ${from} → ${to}. ` +
        `Allowed from ${from}: [${[...(MASTERY_TRANSITIONS[from] ?? [])].join(", ")}]`,
    );
    this.name = "InvalidTransitionError";
  }
}

export class OptimisticLockError extends Error {
  constructor(id: string, expectedVersion: number) {
    super(
      `Optimistic lock conflict on MasteryState ${id}: ` +
        `expected version ${expectedVersion} but row was updated`,
    );
    this.name = "OptimisticLockError";
  }
}
