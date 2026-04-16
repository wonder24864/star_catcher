/**
 * Integration: End-to-End Learning Loop (Sprint 14 placeholder, Sprint 16 delivery).
 *
 * Exercises the closed loop at the DOMAIN layer (Brain decision → enqueue
 * intervention → simulate practice completion → mastery evaluation decision
 * → Memory transition). Uses in-memory stubs for StudentMemory / Redis /
 * enqueue callbacks — no real BullMQ, Postgres, Redis, or LLM.
 *
 * This is the integration level that matters for Phase 3 verification: we
 * prove the *composition* of the already-unit-tested pieces is wired
 * correctly. A full BullMQ process-level test (with real Postgres + Redis +
 * worker) is tracked as future work (see TODO.phase4 in ROADMAP).
 *
 * Scenarios:
 *  1. Golden path: new error → Brain → intervention → practice pass → mastery-eval → MASTERED
 *  2. Brain cooldown: second Brain run within 24h skips intervention
 *  3. Agent recommends REGRESSED on failed practice → Memory transitions
 *  4. Empty state: student with no weak points / no overdue reviews → Brain emits []
 *  5. EvalRunner pipeline wiring: stub callAIOperation + in-memory datasets → EvalRun aggregate is correct
 *
 * See docs/sprints/sprint-16.md (Task 139).
 */
import { describe, test, expect, vi } from "vitest";
import { runLearningBrain } from "@/lib/domain/brain/learning-brain";
import type {
  StudentMemory,
  MasteryStateView,
  ReviewScheduleView,
} from "@/lib/domain/memory/types";
import { runEval } from "@/lib/domain/ai/eval/eval-runner";
import type { EvalDataset } from "@/lib/domain/ai/eval/types";
import type { AIOperationType } from "@prisma/client";
import type { AIHarnessResult } from "@/lib/domain/ai/harness/types";

// ─── In-memory Memory / Redis stubs ────────────────────────────────────

function createMemory(opts: {
  weakPoints?: MasteryStateView[];
  overdueReviews?: ReviewScheduleView[];
}): StudentMemory & {
  _mastery: Map<string, MasteryStateView>;
  _reviews: Map<string, ReviewScheduleView>;
} {
  const mastery = new Map<string, MasteryStateView>();
  for (const m of opts.weakPoints ?? []) mastery.set(m.knowledgePointId, m);
  const reviews = new Map<string, ReviewScheduleView>();
  for (const r of opts.overdueReviews ?? []) reviews.set(r.knowledgePointId, r);

  const memory = {
    getWeakPoints: vi.fn(async () => Array.from(mastery.values())),
    getOverdueReviews: vi.fn(async () => Array.from(reviews.values())),
    getMasteryState: vi.fn(async (_sid: string, kpId: string) => mastery.get(kpId) ?? null),
    updateMasteryState: vi.fn(async (_sid: string, kpId: string, transition) => {
      const cur = mastery.get(kpId);
      if (!cur) throw new Error("no mastery");
      const next: MasteryStateView = {
        ...cur,
        status: transition.to,
        version: cur.version + 1,
      };
      mastery.set(kpId, next);
      return next;
    }),
    getNextReviewDate: vi.fn(),
    scheduleReview: vi.fn(
      async (
        _sid: string,
        kpId: string,
        intervalDays: number,
        sm2Params?: { easeFactor: number; consecutiveCorrect: number },
      ) => {
        const cur = reviews.get(kpId);
        const next: ReviewScheduleView = {
          id: cur?.id ?? `rs-${kpId}`,
          studentId: _sid,
          knowledgePointId: kpId,
          nextReviewAt: new Date(Date.now() + intervalDays * 86_400_000),
          intervalDays,
          easeFactor: sm2Params?.easeFactor ?? cur?.easeFactor ?? 2.5,
          consecutiveCorrect: sm2Params?.consecutiveCorrect ?? cur?.consecutiveCorrect ?? 0,
        };
        reviews.set(kpId, next);
        return next;
      },
    ),
    processReviewResult: vi.fn(),
    recordPracticeAttempt: vi.fn(async (_sid: string, kpId: string, isCorrect: boolean) => {
      const cur = mastery.get(kpId);
      if (!cur) throw new Error("no mastery");
      const next: MasteryStateView = {
        ...cur,
        totalAttempts: cur.totalAttempts + 1,
        correctAttempts: cur.correctAttempts + (isCorrect ? 1 : 0),
        lastAttemptAt: new Date(),
      };
      mastery.set(kpId, next);
      return next;
    }),
    logIntervention: vi.fn(),
    getInterventionHistory: vi.fn(async () => []),
    getWeaknessProfile: vi.fn(async () => null),
    saveWeaknessProfile: vi.fn(),
    archiveMasteryBySchoolLevel: vi.fn(),
    checkFoundationalWeakness: vi.fn(),
  } as unknown as StudentMemory;

  return Object.assign(memory, { _mastery: mastery, _reviews: reviews });
}

function createRedis(cooldownActive = false) {
  const store = new Map<string, string>();
  if (cooldownActive) store.set("brain:intervention-cooldown:student-1", "1");
  return {
    exists: vi.fn(async (key: string) => (store.has(key) ? 1 : 0)),
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return "OK";
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      store.delete(key);
      return 1;
    }),
    _store: store,
  } as unknown as Parameters<typeof runLearningBrain>[1]["redis"];
}

// ─── Fixtures ──────────────────────────────────────────────────────────

function mkMastery(
  overrides: Partial<MasteryStateView> = {},
): MasteryStateView {
  return {
    id: `ms-${overrides.knowledgePointId ?? "kp-1"}`,
    studentId: "student-1",
    knowledgePointId: "kp-1",
    status: "NEW_ERROR",
    totalAttempts: 1,
    correctAttempts: 0,
    lastAttemptAt: new Date(),
    masteredAt: null,
    version: 1,
    archived: false,
    ...overrides,
  };
}

function mkReview(overrides: Partial<ReviewScheduleView> = {}): ReviewScheduleView {
  return {
    id: `rs-${overrides.knowledgePointId ?? "kp-1"}`,
    studentId: "student-1",
    knowledgePointId: "kp-1",
    nextReviewAt: new Date("2020-01-01"), // overdue
    intervalDays: 3,
    easeFactor: 2.5,
    consecutiveCorrect: 1,
    ...overrides,
  };
}

// ─── Scenario 1: Golden path ───────────────────────────────────────────

describe("End-to-End Learning Loop — golden path", () => {
  test("new error → Brain decides intervention → practice pass → mastery transitions to MASTERED", async () => {
    // Brain's active-weak-point filter keeps NEW_ERROR / CORRECTED / REGRESSED.
    // Start at NEW_ERROR, transition after diagnosis → CORRECTED → REVIEWING → MASTERED.
    const memory = createMemory({
      weakPoints: [
        mkMastery({ knowledgePointId: "kp-add", status: "NEW_ERROR", totalAttempts: 1, correctAttempts: 0 }),
      ],
      overdueReviews: [],
    });
    const redis = createRedis(false);

    // 1. Brain runs for this student.
    const decision = await runLearningBrain(
      { studentId: "student-1", userId: "user-1", locale: "zh-CN" },
      { memory, redis },
    );

    expect(decision.eventsProcessed).toBeGreaterThan(0);
    const intervention = decision.agentsToLaunch.find(
      (a) => a.jobName === "intervention-planning",
    );
    expect(intervention).toBeDefined();

    // 2. Intervention-planning handler would enqueue a PRACTICE DailyTask.
    //    Upon correction, transitions NEW_ERROR → CORRECTED → REVIEWING.
    await memory.updateMasteryState("student-1", "kp-add", {
      from: "NEW_ERROR",
      to: "CORRECTED",
      reason: "Student answered correction correctly",
    });
    await memory.updateMasteryState("student-1", "kp-add", {
      from: "CORRECTED",
      to: "REVIEWING",
      reason: "Enqueued for review cycle",
    });
    await memory.recordPracticeAttempt("student-1", "kp-add", true);

    // 3. Mastery-evaluation Agent (simulated) recommends MASTERED.
    //    Handler applies the transition via Memory.
    await memory.updateMasteryState("student-1", "kp-add", {
      from: "REVIEWING",
      to: "MASTERED",
      reason: "Consecutive correct runs, masterySpeed high",
    });
    await memory.scheduleReview("student-1", "kp-add", 365, {
      easeFactor: 2.6,
      consecutiveCorrect: 4,
    });

    // 4. Final state check: MASTERED + long review interval.
    const final = memory._mastery.get("kp-add");
    expect(final?.status).toBe("MASTERED");
    const review = memory._reviews.get("kp-add");
    expect(review?.intervalDays).toBe(365);
  });
});

// ─── Scenario 2: Brain cooldown ────────────────────────────────────────

describe("End-to-End Learning Loop — Brain cooldown", () => {
  test("second Brain run within 24h skips intervention-planning", async () => {
    const memory = createMemory({
      weakPoints: [mkMastery({ knowledgePointId: "kp-a", status: "NEW_ERROR" })],
    });
    const redis = createRedis(true); // cooldown already set

    const decision = await runLearningBrain(
      { studentId: "student-1", userId: "user-1", locale: "zh-CN" },
      { memory, redis },
    );

    const intervention = decision.agentsToLaunch.find(
      (a) => a.jobName === "intervention-planning",
    );
    expect(intervention).toBeUndefined();
    // Cooldown skip should be recorded in `skipped`.
    const cooldownSkip = decision.skipped.find(
      (s) => s.jobName === "intervention-planning",
    );
    expect(cooldownSkip).toBeDefined();
    expect(cooldownSkip?.reason).toMatch(/within last|cooldown/i);
  });
});

// ─── Scenario 3: REGRESSED after failed practice ───────────────────────

describe("End-to-End Learning Loop — regression path", () => {
  test("failed practice + Agent REGRESSED recommendation → Memory transitions", async () => {
    const memory = createMemory({
      weakPoints: [
        mkMastery({ knowledgePointId: "kp-frac", status: "REVIEWING" }),
      ],
    });

    await memory.recordPracticeAttempt("student-1", "kp-frac", false);

    await memory.updateMasteryState("student-1", "kp-frac", {
      from: "REVIEWING",
      to: "REGRESSED",
      reason: "Consecutive errors, masterySpeed low",
    });

    const final = memory._mastery.get("kp-frac");
    expect(final?.status).toBe("REGRESSED");
  });
});

// ─── Scenario 4: Empty state ──────────────────────────────────────────

describe("End-to-End Learning Loop — empty state", () => {
  test("student with no weak points / no overdue reviews → Brain launches nothing", async () => {
    const memory = createMemory({ weakPoints: [], overdueReviews: [] });
    const redis = createRedis(false);

    const decision = await runLearningBrain(
      { studentId: "student-1", userId: "user-1", locale: "zh-CN" },
      { memory, redis },
    );

    expect(decision.eventsProcessed).toBe(0);
    expect(decision.agentsToLaunch).toHaveLength(0);
  });
});

// ─── Scenario 5: EvalRunner pipeline wiring ───────────────────────────

describe("End-to-End Learning Loop — EvalRunner integration", () => {
  test("EvalRunner aggregates PASS/FAIL/SKIPPED correctly across mixed ops", async () => {
    const datasets = new Map<AIOperationType, EvalDataset>();
    datasets.set("SUBJECT_DETECT", {
      operation: "SUBJECT_DETECT",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: [],
      cases: [
        { id: "pass-1", input: {}, expected: { subject: "MATH" } },
        { id: "fail-1", input: {}, expected: { subject: "CHINESE" } },
      ],
    });
    datasets.set("DIAGNOSE_ERROR", {
      operation: "DIAGNOSE_ERROR",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: ["errorDescription"],
      cases: [
        { id: "judge-pass", input: {}, expected: { errorDescription: "x" } },
      ],
    });
    datasets.set("WEAKNESS_PROFILE", {
      operation: "WEAKNESS_PROFILE",
      version: "1.0.0",
      exactMatchFields: [],
      judgedFields: [],
      cases: [],
      unavailableReason: "stub",
    });

    const callAI = vi.fn(
      async (op: string): Promise<AIHarnessResult<unknown>> => {
        if (op === "SUBJECT_DETECT") {
          // First SUBJECT_DETECT call passes, second fails (expected CHINESE, returns MATH).
          return { success: true, data: { subject: "MATH" } };
        }
        if (op === "DIAGNOSE_ERROR") {
          return { success: true, data: { errorDescription: "similar text" } };
        }
        if (op === "EVAL_JUDGE") {
          return {
            success: true,
            data: { score: 4, passed: true, reasoning: "close enough on meaning" },
          };
        }
        throw new Error(`unexpected op ${op}`);
      },
    );

    const db = {
      evalCase: {
        createMany: vi.fn(async ({ data }: { data: unknown[] }) => ({
          count: data.length,
        })),
      },
      evalRun: {
        update: vi.fn(async () => ({})),
      },
    } as unknown as Parameters<typeof runEval>[1]["db"];

    const result = await runEval(
      {
        runId: "integration-run",
        adminId: "admin-1",
        operations: ["SUBJECT_DETECT", "DIAGNOSE_ERROR", "WEAKNESS_PROFILE"],
        locale: "zh-CN",
      },
      {
        db,
        callAIOperation: callAI,
        loadDatasets: async () => datasets,
      },
    );

    // 2 subject-detect (1 pass 1 fail) + 1 diagnose (pass via judge) + 1 skipped weakness-profile
    expect(result.totalCases).toBe(4);
    expect(result.passedCases).toBe(2);
    expect(result.failedCases).toBe(1);
    expect(result.skippedCases).toBe(1);
    // passRate denominator excludes SKIPPED: 2 / (4 - 1) = 0.666...
    expect(result.passRate).toBeCloseTo(2 / 3, 5);
  });
});

// ─── Future work ───────────────────────────────────────────────────────

describe("End-to-End Learning Loop — future work", () => {
  test.todo(
    "Process-level: real BullMQ + Postgres + Redis worker, seeded admin, triggers eval-run, polls EvalRun.status until COMPLETED",
  );
});
