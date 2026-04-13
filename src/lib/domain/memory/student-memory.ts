/**
 * StudentMemoryImpl — Memory layer for student learning state.
 *
 * All Agent/Skill writes to student state MUST go through this layer.
 * Validates mastery state machine transitions, manages review scheduling,
 * and logs interventions.
 *
 * See: docs/adr/010-student-memory-layer.md
 */
import type { PrismaClient } from "@prisma/client";
import { createLogger } from "@/lib/infra/logger";
import {
  MASTERY_TRANSITIONS,
  InvalidTransitionError,
  OptimisticLockError,
} from "./types";
import type {
  StudentMemory,
  MasteryStateView,
  MasteryTransition,
  MasteryStatus,
  ReviewScheduleView,
  ReviewResult,
  InterventionKind,
  InterventionRecord,
} from "./types";
import {
  calculateSM2,
  DEFAULT_EASE_FACTOR,
  MASTERY_THRESHOLD,
} from "../spaced-repetition";

export class StudentMemoryImpl implements StudentMemory {
  /** Recursion guard for auto-transitions */
  private _autoTransitioning = false;

  constructor(private readonly db: PrismaClient) {}

  // ─── Mastery State ────────────────────────────

  async getMasteryState(
    studentId: string,
    knowledgePointId: string,
  ): Promise<MasteryStateView | null> {
    const row = await this.db.masteryState.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });
    return row ? this.toMasteryView(row) : null;
  }

  async updateMasteryState(
    studentId: string,
    knowledgePointId: string,
    transition: MasteryTransition,
  ): Promise<MasteryStateView> {
    // 1. Validate transition
    this.validateTransition(transition.from, transition.to);

    // 2. Load current state (with version for optimistic locking)
    const current = await this.db.masteryState.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });

    if (!current) {
      throw new Error(
        `MasteryState not found for student=${studentId}, kp=${knowledgePointId}`,
      );
    }

    // Verify the from-state matches current
    if (current.status !== transition.from) {
      throw new InvalidTransitionError(
        current.status as MasteryStatus,
        transition.to,
      );
    }

    // 3. Build update data
    // Note: totalAttempts / correctAttempts are NOT updated here — they
    // track individual answer attempts, not state transitions. A separate
    // method (or the caller) should increment them when the student answers.
    const now = new Date();
    const updateData: Record<string, unknown> = {
      status: transition.to,
      lastAttemptAt: now,
      version: { increment: 1 },
    };

    if (transition.to === "MASTERED") {
      updateData.masteredAt = now;
    }
    if (transition.to === "REGRESSED") {
      updateData.masteredAt = null;
    }

    // 4. Optimistic lock update
    const updated = await this.db.masteryState.updateMany({
      where: {
        id: current.id,
        version: current.version,
      },
      data: updateData,
    });

    if (updated.count === 0) {
      throw new OptimisticLockError(current.id, current.version);
    }

    // 5. Log the transition as an intervention
    await this.db.interventionHistory.create({
      data: {
        studentId,
        knowledgePointId,
        type: "REVIEW",
        content: {
          transition: `${transition.from} → ${transition.to}`,
          reason: transition.reason,
        },
      },
    });

    // 6. Re-fetch and return
    const result = await this.db.masteryState.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });
    const view = this.toMasteryView(result!);

    // 7. Auto-transitions (best-effort, never fails the explicit transition)
    await this.handleAutoTransitions(studentId, knowledgePointId, transition.to);

    return view;
  }

  async getWeakPoints(
    studentId: string,
    options?: { subject?: string; limit?: number },
  ): Promise<MasteryStateView[]> {
    const weakStatuses: MasteryStatus[] = [
      "NEW_ERROR",
      "CORRECTED",
      "REGRESSED",
    ];

    const rows = await this.db.masteryState.findMany({
      where: {
        studentId,
        status: { in: weakStatuses },
        ...(options?.subject
          ? { knowledgePoint: { subject: options.subject as never } }
          : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: options?.limit ?? 50,
    });

    return rows.map((r) => this.toMasteryView(r));
  }

  // ─── Mastery State Upsert ─────────────────────

  /**
   * Ensure a MasteryState exists for the given student + knowledge point.
   * Upsert semantics:
   *   - Not found → create with NEW_ERROR status
   *   - Found with MASTERED → transition to REGRESSED
   *   - Found with other status → increment totalAttempts only
   *
   * Handles optimistic lock conflicts with a single retry.
   */
  async ensureMasteryState(
    studentId: string,
    knowledgePointId: string,
  ): Promise<MasteryStateView> {
    const existing = await this.db.masteryState.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });

    if (!existing) {
      // Create new MasteryState with NEW_ERROR
      const created = await this.db.masteryState.create({
        data: {
          studentId,
          knowledgePointId,
          status: "NEW_ERROR",
          totalAttempts: 1,
          lastAttemptAt: new Date(),
        },
      });
      return this.toMasteryView(created);
    }

    if (existing.status === "MASTERED") {
      // Trigger MASTERED → REGRESSED transition
      try {
        return await this.updateMasteryState(studentId, knowledgePointId, {
          from: "MASTERED",
          to: "REGRESSED",
          reason: "New error on previously mastered knowledge point",
        });
      } catch (error) {
        if (error instanceof OptimisticLockError) {
          // Retry once on optimistic lock conflict
          return this.ensureMasteryState(studentId, knowledgePointId);
        }
        throw error;
      }
    }

    // Other statuses: increment totalAttempts only
    try {
      const updated = await this.db.masteryState.updateMany({
        where: { id: existing.id, version: existing.version },
        data: {
          totalAttempts: { increment: 1 },
          lastAttemptAt: new Date(),
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        // Retry once on optimistic lock conflict
        return this.ensureMasteryState(studentId, knowledgePointId);
      }
    } catch {
      // Best-effort increment; don't fail the whole flow
    }

    // Re-fetch and return
    const result = await this.db.masteryState.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });
    return this.toMasteryView(result!);
  }

  // ─── Review Scheduling ────────────────────────

  async getNextReviewDate(
    studentId: string,
    knowledgePointId: string,
  ): Promise<Date | null> {
    const schedule = await this.db.reviewSchedule.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });
    return schedule?.nextReviewAt ?? null;
  }

  async scheduleReview(
    studentId: string,
    knowledgePointId: string,
    intervalDays: number,
    sm2Params?: { easeFactor: number; consecutiveCorrect: number },
  ): Promise<ReviewScheduleView> {
    const nextReviewAt = new Date();
    nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

    const ef = sm2Params?.easeFactor ?? DEFAULT_EASE_FACTOR;
    const cc = sm2Params?.consecutiveCorrect ?? 0;

    const schedule = await this.db.reviewSchedule.upsert({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
      create: {
        studentId,
        knowledgePointId,
        nextReviewAt,
        intervalDays,
        easeFactor: ef,
        consecutiveCorrect: cc,
      },
      update: {
        nextReviewAt,
        intervalDays,
        easeFactor: ef,
        consecutiveCorrect: cc,
      },
    });

    return this.toReviewView(schedule);
  }

  async getOverdueReviews(studentId: string): Promise<ReviewScheduleView[]> {
    const rows = await this.db.reviewSchedule.findMany({
      where: {
        studentId,
        nextReviewAt: { lte: new Date() },
      },
      orderBy: { nextReviewAt: "asc" },
    });
    return rows.map((r) => this.toReviewView(r));
  }

  // ─── Intervention History ─────────────────────

  async logIntervention(
    studentId: string,
    knowledgePointId: string,
    type: InterventionKind,
    content: unknown,
    source?: { agentId?: string; skillId?: string },
  ): Promise<InterventionRecord> {
    const row = await this.db.interventionHistory.create({
      data: {
        studentId,
        knowledgePointId,
        type,
        content: content as never,
        agentId: source?.agentId ?? null,
        skillId: source?.skillId ?? null,
      },
    });
    return this.toInterventionRecord(row);
  }

  async getInterventionHistory(
    studentId: string,
    knowledgePointId: string,
  ): Promise<InterventionRecord[]> {
    const rows = await this.db.interventionHistory.findMany({
      where: { studentId, knowledgePointId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => this.toInterventionRecord(r));
  }

  // ─── Review Processing (SM-2) ─────────────────

  async processReviewResult(
    studentId: string,
    knowledgePointId: string,
    quality: number,
  ): Promise<ReviewResult> {
    // 1. Load current state
    const mastery = await this.getMasteryState(studentId, knowledgePointId);
    if (!mastery) {
      throw new Error(
        `MasteryState not found for student=${studentId}, kp=${knowledgePointId}`,
      );
    }
    if (mastery.status !== "REVIEWING") {
      throw new Error(
        `Cannot process review: MasteryState is ${mastery.status}, expected REVIEWING`,
      );
    }

    // 2. Load current schedule (create default if missing)
    let schedule = await this.db.reviewSchedule.findUnique({
      where: {
        studentId_knowledgePointId: { studentId, knowledgePointId },
      },
    });
    if (!schedule) {
      // Defensive: create a default schedule if somehow missing
      const defaultSchedule = await this.scheduleReview(
        studentId,
        knowledgePointId,
        1,
      );
      schedule = {
        id: defaultSchedule.id,
        studentId: defaultSchedule.studentId,
        knowledgePointId: defaultSchedule.knowledgePointId,
        nextReviewAt: defaultSchedule.nextReviewAt,
        intervalDays: defaultSchedule.intervalDays,
        easeFactor: defaultSchedule.easeFactor,
        consecutiveCorrect: defaultSchedule.consecutiveCorrect,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // 3. Run SM-2 algorithm
    const sm2Result = calculateSM2({
      quality,
      repetition: schedule.consecutiveCorrect,
      interval: schedule.intervalDays,
      easeFactor: schedule.easeFactor,
    });

    // 4. Update MasteryState attempt counters
    await this.db.masteryState.updateMany({
      where: { id: mastery.id, version: mastery.version },
      data: {
        totalAttempts: { increment: 1 },
        ...(quality >= 3 ? { correctAttempts: { increment: 1 } } : {}),
        lastAttemptAt: new Date(),
        version: { increment: 1 },
      },
    });

    let transition: MasteryTransition | null = null;

    if (quality >= 3) {
      // 5a. Correct: update ReviewSchedule with SM-2 values
      const updatedSchedule = await this.scheduleReview(
        studentId,
        knowledgePointId,
        sm2Result.interval,
        {
          easeFactor: sm2Result.easeFactor,
          consecutiveCorrect: sm2Result.repetition,
        },
      );

      // Check mastery threshold
      if (sm2Result.repetition >= MASTERY_THRESHOLD) {
        transition = {
          from: "REVIEWING",
          to: "MASTERED",
          reason: `Consecutive correct reviews reached ${sm2Result.repetition} (threshold: ${MASTERY_THRESHOLD})`,
        };
        await this.updateMasteryState(
          studentId,
          knowledgePointId,
          transition,
        );
      }

      // Log the review
      await this.logIntervention(studentId, knowledgePointId, "REVIEW", {
        quality,
        isCorrect: true,
        sm2: sm2Result,
        transition: transition
          ? `${transition.from} → ${transition.to}`
          : null,
      });

      const finalMastery = await this.getMasteryState(
        studentId,
        knowledgePointId,
      );
      return {
        mastery: finalMastery!,
        schedule: updatedSchedule,
        transition,
      };
    } else {
      // 5b. Incorrect: transition REVIEWING → REGRESSED
      // (auto-transition in handleAutoTransitions will chain REGRESSED → REVIEWING + reschedule)
      transition = {
        from: "REVIEWING",
        to: "REGRESSED",
        reason: `Review quality ${quality} < 3 (incorrect)`,
      };
      await this.updateMasteryState(
        studentId,
        knowledgePointId,
        transition,
      );

      // Log the review
      await this.logIntervention(studentId, knowledgePointId, "REVIEW", {
        quality,
        isCorrect: false,
        sm2: sm2Result,
        transition: "REVIEWING → REGRESSED → REVIEWING (auto)",
      });

      // Re-fetch final state (should be REVIEWING after auto-transition)
      const finalMastery = await this.getMasteryState(
        studentId,
        knowledgePointId,
      );
      const finalSchedule = await this.db.reviewSchedule.findUnique({
        where: {
          studentId_knowledgePointId: { studentId, knowledgePointId },
        },
      });

      return {
        mastery: finalMastery!,
        schedule: finalSchedule
          ? this.toReviewView(finalSchedule)
          : (await this.scheduleReview(studentId, knowledgePointId, 1, {
              easeFactor: sm2Result.easeFactor,
              consecutiveCorrect: 0,
            })),
        transition,
      };
    }
  }

  // ─── Auto-Transitions (best-effort) ──────────

  /**
   * Handle automatic state transitions after an explicit transition.
   * CORRECTED → REVIEWING + schedule first review.
   * REGRESSED → REVIEWING + schedule review (interval=1).
   *
   * Best-effort: failures are logged but never propagate.
   * Recursion-safe: guarded by _autoTransitioning flag.
   */
  private async handleAutoTransitions(
    studentId: string,
    knowledgePointId: string,
    newStatus: MasteryStatus,
  ): Promise<void> {
    if (this._autoTransitioning) return;

    if (newStatus !== "CORRECTED" && newStatus !== "REGRESSED") return;

    this._autoTransitioning = true;
    try {
      if (newStatus === "CORRECTED") {
        await this.updateMasteryState(studentId, knowledgePointId, {
          from: "CORRECTED",
          to: "REVIEWING",
          reason: "Auto-transition: entering review queue after correction",
        });
        await this.scheduleReview(studentId, knowledgePointId, 1);
      } else if (newStatus === "REGRESSED") {
        // Preserve existing easeFactor if available
        const existing = await this.db.reviewSchedule.findUnique({
          where: {
            studentId_knowledgePointId: { studentId, knowledgePointId },
          },
        });
        await this.updateMasteryState(studentId, knowledgePointId, {
          from: "REGRESSED",
          to: "REVIEWING",
          reason: "Auto-transition: re-entering review queue after regression",
        });
        await this.scheduleReview(studentId, knowledgePointId, 1, {
          easeFactor: existing?.easeFactor ?? DEFAULT_EASE_FACTOR,
          consecutiveCorrect: 0,
        });
      }
    } catch (error) {
      createLogger("student-memory").warn(
        { studentId, knowledgePointId, err: error },
        "Auto-transition failed",
      );
    } finally {
      this._autoTransitioning = false;
    }
  }

  // ─── Validation ───────────────────────────────

  private validateTransition(from: MasteryStatus, to: MasteryStatus): void {
    const allowed = MASTERY_TRANSITIONS[from];
    if (!allowed || !allowed.has(to)) {
      throw new InvalidTransitionError(from, to);
    }
  }

  // ─── Mapping ──────────────────────────────────

  private toMasteryView(row: {
    id: string;
    studentId: string;
    knowledgePointId: string;
    status: string;
    totalAttempts: number;
    correctAttempts: number;
    lastAttemptAt: Date | null;
    masteredAt: Date | null;
    version: number;
  }): MasteryStateView {
    return {
      id: row.id,
      studentId: row.studentId,
      knowledgePointId: row.knowledgePointId,
      status: row.status as MasteryStatus,
      totalAttempts: row.totalAttempts,
      correctAttempts: row.correctAttempts,
      lastAttemptAt: row.lastAttemptAt,
      masteredAt: row.masteredAt,
      version: row.version,
    };
  }

  private toReviewView(row: {
    id: string;
    studentId: string;
    knowledgePointId: string;
    nextReviewAt: Date;
    intervalDays: number;
    easeFactor: number;
    consecutiveCorrect: number;
  }): ReviewScheduleView {
    return {
      id: row.id,
      studentId: row.studentId,
      knowledgePointId: row.knowledgePointId,
      nextReviewAt: row.nextReviewAt,
      intervalDays: row.intervalDays,
      easeFactor: row.easeFactor,
      consecutiveCorrect: row.consecutiveCorrect,
    };
  }

  private toInterventionRecord(row: {
    id: string;
    type: string;
    content: unknown;
    agentId: string | null;
    skillId: string | null;
    createdAt: Date;
  }): InterventionRecord {
    return {
      id: row.id,
      type: row.type as InterventionKind,
      content: row.content,
      agentId: row.agentId,
      skillId: row.skillId,
      createdAt: row.createdAt,
    };
  }
}
