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

// ─── Progressive Cooldown (D55) ─────────────────
// Tier 1 = 6h, Tier 2 = 12h, Tier 3 = 24h (cap).
// Redis value: JSON `{tier, setAt}`. Handler increments tier on each set.

/** Cooldown duration per tier (seconds). Index = tier - 1. */
export const COOLDOWN_TIERS = [
  6 * 3600,  // tier 1: 6h
  12 * 3600, // tier 2: 12h
  24 * 3600, // tier 3: 24h (cap)
] as const;

export const MAX_COOLDOWN_TIER = COOLDOWN_TIERS.length; // 3

export interface CooldownValue {
  tier: number;
  setAt: string; // ISO timestamp
}

/**
 * Redis key for intervention-planning cooldown per student.
 * Set when Brain enqueues intervention-planning, expires per tier.
 */
export function cooldownKey(studentId: string): string {
  return `brain:intervention-cooldown:${studentId}`;
}

/**
 * Parse Redis cooldown value with fault tolerance.
 * Returns null if key doesn't exist or JSON is corrupt.
 */
export function parseCooldownValue(raw: string | null): CooldownValue | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.tier === "number" && typeof parsed.setAt === "string") {
      return parsed as CooldownValue;
    }
    // Legacy "1" format or corrupt — treat as expired
    return null;
  } catch {
    return null;
  }
}

/**
 * Get cooldown TTL in seconds for a given tier (1-based).
 * Tiers beyond MAX_COOLDOWN_TIER use the cap (24h).
 */
export function getCooldownTTL(tier: number): number {
  const idx = Math.min(tier, MAX_COOLDOWN_TIER) - 1;
  return COOLDOWN_TIERS[Math.max(0, idx)];
}

/**
 * Check if intervention-planning is on cooldown for this student.
 * Returns the current cooldown value if active, null if expired/absent.
 */
async function getActiveCooldown(
  redis: Redis,
  studentId: string,
): Promise<CooldownValue | null> {
  const raw = await redis.get(cooldownKey(studentId));
  return parseCooldownValue(raw);
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
 * 3. Check progressive cooldown for intervention-planning (D55: tier 1=6h, 2=12h, 3=24h)
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

  // 3. Read PERIODIC WeaknessProfile for trend data (best-effort, never blocks core logic)
  let worseningKPIds: string[] = [];
  try {
    const profile = await memory.getWeaknessProfile(studentId, "PERIODIC");
    if (profile) {
      worseningKPIds = profile.data.weakPoints
        .filter((wp) => wp.trend === "WORSENING")
        .map((wp) => wp.kpId);
    }
  } catch {
    // WeaknessProfile is enhancement data — if unavailable, proceed without it
  }

  const eventsProcessed = weakPoints.length + overdueReviews.length;

  // 4. Merge intervention KP IDs (weak points + worsening trend)
  const weakKPIds = weakPoints.map((wp) => wp.knowledgePointId);
  const allInterventionKPIds = [...new Set([...weakKPIds, ...worseningKPIds])];

  // 5. Intervention planning (with progressive cooldown — D55)
  if (allInterventionKPIds.length > 0) {
    const cooldown = await getActiveCooldown(redis, studentId);

    if (cooldown) {
      const ttlHours = getCooldownTTL(cooldown.tier) / 3600;
      skipped.push({
        jobName: "intervention-planning",
        reason: `Skipped: intervention-planning on cooldown tier ${cooldown.tier} (${ttlHours}h) for student ${studentId}`,
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
