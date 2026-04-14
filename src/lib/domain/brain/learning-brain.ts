/**
 * Learning Brain — Deterministic Orchestrator Core
 *
 * Reads student Memory state and decides which AI Agents to enqueue.
 * This is pure deterministic logic (no AI calls) per CLAUDE.md Rule 8.
 *
 * The function returns a BrainDecision — it does NOT have side effects
 * (no BullMQ, no Redis, no AdminLog). The handler is responsible for
 * executing the decision.
 *
 * See: docs/adr/011-learning-closed-loop.md (D11-D13)
 */

import type { StudentMemory, MasteryStateView, ReviewScheduleView } from "@/lib/domain/memory/types";
import type Redis from "ioredis";

// ─── Types ──────────────────────────────────────

export interface BrainInput {
  studentId: string;
  userId: string;
  locale: string;
}

export interface BrainDeps {
  /** Memory interface for reading student state */
  memory: StudentMemory;
  /** Redis for cooldown checks */
  redis: Redis;
}

export interface BrainDecision {
  /** Jobs to enqueue */
  agentsToLaunch: BrainAgentLaunch[];
  /** Total events processed (weak points + overdue reviews) */
  eventsProcessed: number;
  /** Records of skipped actions (e.g., cooldown) */
  skipped: BrainSkipRecord[];
}

export interface BrainAgentLaunch {
  jobName: "intervention-planning" | "mastery-evaluation";
  data: Record<string, unknown>;
  reason: string;
}

export interface BrainSkipRecord {
  jobName: string;
  reason: string;
}

// ─── Cooldown Check ─────────────────────────────

export const COOLDOWN_SECONDS = 24 * 60 * 60; // 24h

/**
 * Redis key for intervention-planning cooldown per student.
 * Set when Brain enqueues intervention-planning, expires after 24h.
 */
export function cooldownKey(studentId: string): string {
  return `brain:intervention-cooldown:${studentId}`;
}

/**
 * Check if intervention-planning was recently enqueued for this student.
 * Uses a Redis key with 24h TTL set by the handler after enqueuing.
 */
async function hasRecentInterventionPlanning(
  redis: Redis,
  studentId: string,
): Promise<boolean> {
  const exists = await redis.exists(cooldownKey(studentId));
  return exists === 1;
}

// ─── Active Weak Points Filter ──────────────────

const ACTIVE_STATUSES = new Set(["NEW_ERROR", "CORRECTED", "REGRESSED"]);

function filterActiveWeakPoints(weakPoints: MasteryStateView[]): MasteryStateView[] {
  return weakPoints.filter((wp) => ACTIVE_STATUSES.has(wp.status));
}

// ─── Core Brain Logic ───────────────────────────

/**
 * Run Learning Brain for one student. Deterministic, no AI calls.
 *
 * Decision logic:
 * 1. Read weak points (NEW_ERROR / CORRECTED / REGRESSED)
 * 2. Read overdue reviews (nextReviewAt <= now)
 * 3. Check 24h cooldown for intervention-planning
 * 4. Weak points + no cooldown → enqueue intervention-planning
 * 5. Each overdue review → enqueue mastery-evaluation
 */
export async function runLearningBrain(
  input: BrainInput,
  deps: BrainDeps,
): Promise<BrainDecision> {
  const { studentId, userId, locale } = input;
  const { memory, redis } = deps;

  const agentsToLaunch: BrainAgentLaunch[] = [];
  const skipped: BrainSkipRecord[] = [];

  // 1. Read weak points
  const allWeakPoints = await memory.getWeakPoints(studentId);
  const weakPoints = filterActiveWeakPoints(allWeakPoints);

  // 2. Read overdue reviews
  const overdueReviews = await memory.getOverdueReviews(studentId);

  // 3. Read PERIODIC WeaknessProfile for trend data
  const profile = await memory.getWeaknessProfile(studentId, "PERIODIC");
  const worseningKPIds = profile
    ? profile.data.weakPoints
        .filter((wp) => wp.trend === "WORSENING")
        .map((wp) => wp.kpId)
    : [];

  const eventsProcessed = weakPoints.length + overdueReviews.length;

  // 4. Merge intervention KP IDs (weak points + worsening trend)
  const weakKPIds = weakPoints.map((wp) => wp.knowledgePointId);
  const allInterventionKPIds = [...new Set([...weakKPIds, ...worseningKPIds])];

  // 5. Intervention planning (with 24h cooldown)
  if (allInterventionKPIds.length > 0) {
    const cooledDown = await hasRecentInterventionPlanning(redis, studentId);

    if (cooledDown) {
      skipped.push({
        jobName: "intervention-planning",
        reason: `Skipped: intervention-planning ran within last ${COOLDOWN_SECONDS / 3600}h for student ${studentId}`,
      });
    } else {
      const reasonParts: string[] = [];
      if (weakKPIds.length > 0) {
        reasonParts.push(`${weakKPIds.length} weak point(s)`);
      }
      if (worseningKPIds.length > 0) {
        reasonParts.push(`${worseningKPIds.length} worsening trend(s)`);
      }
      agentsToLaunch.push({
        jobName: "intervention-planning",
        data: { studentId, knowledgePointIds: allInterventionKPIds, userId, locale },
        reason: reasonParts.join(" + "),
      });
    }
  }

  // 6. Mastery evaluation (one per overdue KP, no cooldown)
  for (const review of overdueReviews) {
    agentsToLaunch.push({
      jobName: "mastery-evaluation",
      data: {
        studentId,
        knowledgePointId: review.knowledgePointId,
        reviewScheduleId: review.id,
        userId,
        locale,
      },
      reason: `Overdue review for KP ${review.knowledgePointId} (due ${review.nextReviewAt.toISOString().split("T")[0]})`,
    });
  }

  return { agentsToLaunch, eventsProcessed, skipped };
}
