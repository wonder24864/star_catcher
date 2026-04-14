/**
 * Unit Tests: Learning Brain Core Logic
 *
 * Verifies deterministic decision-making:
 * - Weak points → intervention-planning
 * - Overdue reviews → mastery-evaluation
 * - 24h cooldown enforcement
 * - No side effects (pure decision output)
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { runLearningBrain } from "@/lib/domain/brain/learning-brain";
import type { StudentMemory, MasteryStateView, ReviewScheduleView } from "@/lib/domain/memory/types";

// ─── Mock Redis for cooldown checks ─────────────

function createMockRedis(cooldownActive = false) {
  return {
    exists: vi.fn().mockResolvedValue(cooldownActive ? 1 : 0),
  } as any;
}

// ─── Mock Memory ────────────────────────────────

function createMockMemory(
  weakPoints: MasteryStateView[] = [],
  overdueReviews: ReviewScheduleView[] = [],
): StudentMemory {
  return {
    getWeakPoints: vi.fn().mockResolvedValue(weakPoints),
    getOverdueReviews: vi.fn().mockResolvedValue(overdueReviews),
    getMasteryState: vi.fn(),
    updateMasteryState: vi.fn(),
    getNextReviewDate: vi.fn(),
    scheduleReview: vi.fn(),
    processReviewResult: vi.fn(),
    logIntervention: vi.fn(),
    getInterventionHistory: vi.fn(),
  };
}

// ─── Test Fixtures ──────────────────────────────

function makeMastery(
  overrides: Partial<MasteryStateView> = {},
): MasteryStateView {
  return {
    id: "ms-1",
    studentId: "student-1",
    knowledgePointId: "kp-1",
    status: "NEW_ERROR",
    totalAttempts: 1,
    correctAttempts: 0,
    lastAttemptAt: new Date(),
    masteredAt: null,
    version: 1,
    ...overrides,
  };
}

function makeReview(
  overrides: Partial<ReviewScheduleView> = {},
): ReviewScheduleView {
  return {
    id: "rs-1",
    studentId: "student-1",
    knowledgePointId: "kp-1",
    nextReviewAt: new Date("2020-01-01"), // past = overdue
    intervalDays: 3,
    easeFactor: 2.5,
    consecutiveCorrect: 1,
    ...overrides,
  };
}

const defaultInput = { studentId: "student-1", userId: "user-1", locale: "zh" };

// ─── Tests ──────────────────────────────────────

describe("Learning Brain", () => {
  // ── Empty state ──

  test("returns empty decision when no weak points and no overdue reviews", async () => {
    const memory = createMockMemory([], []);
    const mockRedis = createMockRedis();

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    expect(decision.agentsToLaunch).toEqual([]);
    expect(decision.skipped).toEqual([]);
    expect(decision.eventsProcessed).toBe(0);
  });

  // ── Weak points → intervention-planning ──

  test("enqueues intervention-planning when weak points exist", async () => {
    const weakPoints = [
      makeMastery({ knowledgePointId: "kp-1", status: "NEW_ERROR" }),
      makeMastery({ knowledgePointId: "kp-2", status: "CORRECTED" }),
      makeMastery({ knowledgePointId: "kp-3", status: "REGRESSED" }),
    ];
    const memory = createMockMemory(weakPoints, []);
    const mockRedis = createMockRedis(false); // no recent runs

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    expect(decision.agentsToLaunch).toHaveLength(1);
    expect(decision.agentsToLaunch[0].jobName).toBe("intervention-planning");
    expect(decision.agentsToLaunch[0].data).toEqual({
      studentId: "student-1",
      knowledgePointIds: ["kp-1", "kp-2", "kp-3"],
      userId: "user-1",
      locale: "zh",
    });
    expect(decision.eventsProcessed).toBe(3);
    expect(decision.skipped).toEqual([]);
  });

  // ── Overdue reviews → mastery-evaluation ──

  test("enqueues mastery-evaluation for each overdue review", async () => {
    const overdueReviews = [
      makeReview({ id: "rs-1", knowledgePointId: "kp-10" }),
      makeReview({ id: "rs-2", knowledgePointId: "kp-20" }),
    ];
    const memory = createMockMemory([], overdueReviews);
    const mockRedis = createMockRedis();

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    expect(decision.agentsToLaunch).toHaveLength(2);
    expect(decision.agentsToLaunch[0].jobName).toBe("mastery-evaluation");
    expect(decision.agentsToLaunch[0].data).toMatchObject({
      studentId: "student-1",
      knowledgePointId: "kp-10",
      reviewScheduleId: "rs-1",
    });
    expect(decision.agentsToLaunch[1].jobName).toBe("mastery-evaluation");
    expect(decision.agentsToLaunch[1].data).toMatchObject({
      knowledgePointId: "kp-20",
      reviewScheduleId: "rs-2",
    });
    expect(decision.eventsProcessed).toBe(2);
  });

  // ── Both weak points and overdue reviews ──

  test("enqueues both job types when both conditions exist", async () => {
    const weakPoints = [
      makeMastery({ knowledgePointId: "kp-1", status: "NEW_ERROR" }),
    ];
    const overdueReviews = [
      makeReview({ id: "rs-1", knowledgePointId: "kp-10" }),
    ];
    const memory = createMockMemory(weakPoints, overdueReviews);
    const mockRedis = createMockRedis(false);

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    expect(decision.agentsToLaunch).toHaveLength(2);
    const jobNames = decision.agentsToLaunch.map((a) => a.jobName);
    expect(jobNames).toContain("intervention-planning");
    expect(jobNames).toContain("mastery-evaluation");
    expect(decision.eventsProcessed).toBe(2);
  });

  // ── 24h cooldown ──

  test("skips intervention-planning when recently run (24h cooldown)", async () => {
    const weakPoints = [
      makeMastery({ knowledgePointId: "kp-1", status: "NEW_ERROR" }),
    ];
    const memory = createMockMemory(weakPoints, []);
    const mockRedis = createMockRedis(true); // cooldown active

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    expect(decision.agentsToLaunch).toEqual([]);
    expect(decision.skipped).toHaveLength(1);
    expect(decision.skipped[0].jobName).toBe("intervention-planning");
    expect(decision.skipped[0].reason).toContain("24h");
    expect(decision.eventsProcessed).toBe(1);
  });

  test("cooldown does not affect mastery-evaluation", async () => {
    const weakPoints = [
      makeMastery({ knowledgePointId: "kp-1", status: "NEW_ERROR" }),
    ];
    const overdueReviews = [
      makeReview({ id: "rs-1", knowledgePointId: "kp-10" }),
    ];
    const memory = createMockMemory(weakPoints, overdueReviews);
    const mockRedis = createMockRedis(true); // cooldown active

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    // intervention-planning skipped, but mastery-evaluation still runs
    expect(decision.agentsToLaunch).toHaveLength(1);
    expect(decision.agentsToLaunch[0].jobName).toBe("mastery-evaluation");
    expect(decision.skipped).toHaveLength(1);
    expect(decision.skipped[0].jobName).toBe("intervention-planning");
  });

  // ── Filters out MASTERED weak points ──

  test("ignores MASTERED status in weak points", async () => {
    const weakPoints = [
      makeMastery({ knowledgePointId: "kp-1", status: "MASTERED" }),
      makeMastery({ knowledgePointId: "kp-2", status: "REVIEWING" }),
    ];
    const memory = createMockMemory(weakPoints, []);
    const mockRedis = createMockRedis(false);

    const decision = await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    // MASTERED and REVIEWING are not active weak points
    expect(decision.agentsToLaunch).toEqual([]);
    expect(decision.eventsProcessed).toBe(0);
  });

  // ── Queries Memory correctly ──

  test("calls memory.getWeakPoints and getOverdueReviews with studentId", async () => {
    const memory = createMockMemory([], []);
    const mockRedis = createMockRedis();

    await runLearningBrain(defaultInput, { memory, redis: mockRedis });

    expect(memory.getWeakPoints).toHaveBeenCalledWith("student-1");
    expect(memory.getOverdueReviews).toHaveBeenCalledWith("student-1");
  });
});
