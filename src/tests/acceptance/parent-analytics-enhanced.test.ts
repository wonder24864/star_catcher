/**
 * Acceptance Tests: Enhanced Parent Analytics
 * User Stories: US-059, US-060
 * Sprint: 17
 */
import { describe, test, expect, beforeEach } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;
const parentCtx = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };
const studentCtx = { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" };

function setup() {
  db = createMockDb();
  db._families.push({
    id: "fam1", name: "家庭", inviteCode: null, inviteCodeExpiresAt: null,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  db._familyMembers.push(
    { id: "fm1", userId: "parent1", familyId: "fam1", role: "OWNER", joinedAt: new Date() },
    { id: "fm2", userId: "student1", familyId: "fam1", role: "MEMBER", joinedAt: new Date() },
  );
  db._users.push(
    { id: "student1", username: "s1", password: "", nickname: "小明", role: "STUDENT", grade: "PRIMARY_3", locale: "zh", isActive: true, deletedAt: null, loginFailCount: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date() },
  );
}

function addErrorQuestion(
  id: string,
  overrides: { studentId?: string; subject?: string; totalAttempts?: number; correctAttempts?: number; isMastered?: boolean; createdAt?: Date } = {}
) {
  db._errorQuestions.push({
    id,
    studentId: overrides.studentId ?? "student1",
    sessionQuestionId: null,
    subject: overrides.subject ?? "MATH",
    contentType: null,
    grade: null,
    questionType: null,
    content: `q-${id}`,
    contentHash: null,
    studentAnswer: null,
    correctAnswer: null,
    errorAnalysis: null,
    aiKnowledgePoint: null,
    imageUrl: null,
    totalAttempts: overrides.totalAttempts ?? 1,
    correctAttempts: overrides.correctAttempts ?? 0,
    isMastered: overrides.isMastered ?? false,
    deletedAt: null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
  });
}

function addSession(id: string, overrides: { studentId?: string; subject?: string | null; createdAt?: Date } = {}) {
  db._homeworkSessions.push({
    id,
    studentId: overrides.studentId ?? "student1",
    createdBy: overrides.studentId ?? "student1",
    subject: overrides.subject === undefined ? "MATH" : overrides.subject,
    contentType: null,
    grade: null,
    title: `hw-${id}`,
    status: "COMPLETED",
    finalScore: 80,
    totalRounds: 1,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
  });
}

function addHelp(sessionId: string, questionId: string, level: number) {
  db._helpRequests.push({
    id: `hr-${sessionId}-${questionId}-${level}`,
    homeworkSessionId: sessionId,
    sessionQuestionId: questionId,
    level,
    aiResponse: `level ${level}`,
    createdAt: new Date(),
  });
}

// ---------- US-059: correctionRateDistribution ----------

describe("US-059: correctionRateDistribution", () => {
  beforeEach(setup);

  test("groups errors by subject and attempt bucket", async () => {
    addErrorQuestion("eq1", { subject: "MATH", totalAttempts: 1 });
    addErrorQuestion("eq2", { subject: "MATH", totalAttempts: 3 });
    addErrorQuestion("eq3", { subject: "ENGLISH", totalAttempts: 2 });
    addErrorQuestion("eq4", { subject: "ENGLISH", totalAttempts: 2 });
    addErrorQuestion("eq5", { subject: "CHINESE", totalAttempts: 1 });

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.correctionRateDistribution({ studentId: "student1" });

    const math = result.bySubject.find((s) => s.subject === "MATH");
    expect(math).toEqual({ subject: "MATH", oneAttempt: 1, twoAttempts: 0, threeOrMore: 1 });

    const eng = result.bySubject.find((s) => s.subject === "ENGLISH");
    expect(eng).toEqual({ subject: "ENGLISH", oneAttempt: 0, twoAttempts: 2, threeOrMore: 0 });

    const chn = result.bySubject.find((s) => s.subject === "CHINESE");
    expect(chn).toEqual({ subject: "CHINESE", oneAttempt: 1, twoAttempts: 0, threeOrMore: 0 });
  });

  test("respects period filter", async () => {
    const recent = new Date();
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 10);

    addErrorQuestion("eq1", { totalAttempts: 1, createdAt: recent });
    addErrorQuestion("eq2", { totalAttempts: 2, createdAt: old }); // outside 7d window

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.correctionRateDistribution({ studentId: "student1", period: "7d" });

    expect(result.bySubject).toHaveLength(1);
    expect(result.bySubject[0]!.oneAttempt).toBe(1);
  });

  test("returns empty array when no data", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.correctionRateDistribution({ studentId: "student1" });
    expect(result.bySubject).toEqual([]);
  });

  test("FORBIDDEN for STUDENT role", async () => {
    const caller = createCaller(createMockContext(db, studentCtx));
    await expect(
      caller.parent.correctionRateDistribution({ studentId: "student1" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

// ---------- US-059: helpFrequencyDetail ----------

describe("US-059: helpFrequencyDetail", () => {
  beforeEach(setup);

  test("groups help requests by subject and level", async () => {
    addSession("s1", { subject: "MATH" });
    addSession("s2", { subject: "ENGLISH" });
    addHelp("s1", "q1", 1);
    addHelp("s1", "q2", 1);
    addHelp("s1", "q3", 3);
    addHelp("s2", "q4", 2);

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.helpFrequencyDetail({ studentId: "student1" });

    const math = result.bySubject.find((s) => s.subject === "MATH");
    expect(math).toEqual({ subject: "MATH", L1: 2, L2: 0, L3: 1 });

    const eng = result.bySubject.find((s) => s.subject === "ENGLISH");
    expect(eng).toEqual({ subject: "ENGLISH", L1: 0, L2: 1, L3: 0 });
  });

  test("skips sessions with null subject", async () => {
    addSession("s1", { subject: null });
    addHelp("s1", "q1", 1);

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.helpFrequencyDetail({ studentId: "student1" });
    expect(result.bySubject).toEqual([]);
  });

  test("FORBIDDEN for STUDENT role", async () => {
    const caller = createCaller(createMockContext(db, studentCtx));
    await expect(
      caller.parent.helpFrequencyDetail({ studentId: "student1" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

// ---------- US-060: multiStudentComparison ----------

describe("US-060: multiStudentComparison", () => {
  beforeEach(() => {
    setup();
    // Add a second student
    db._users.push(
      { id: "student2", username: "s2", password: "", nickname: "小红", role: "STUDENT", grade: "PRIMARY_5", locale: "zh", isActive: true, deletedAt: null, loginFailCount: 0, lockedUntil: null, createdAt: new Date(), updatedAt: new Date() },
    );
    db._familyMembers.push(
      { id: "fm3", userId: "student2", familyId: "fam1", role: "MEMBER", joinedAt: new Date() },
    );
  });

  test("returns aggregated metrics for all students", async () => {
    // student1: 2 errors, 1 corrected, 1 mastered, 1 help
    addErrorQuestion("eq1", { studentId: "student1", correctAttempts: 1, isMastered: true });
    addErrorQuestion("eq2", { studentId: "student1", correctAttempts: 0, isMastered: false });
    addSession("s1", { studentId: "student1" });
    addHelp("s1", "q1", 1);

    // student2: 1 error, 0 corrected, 0 mastered, 0 helps
    addErrorQuestion("eq3", { studentId: "student2", correctAttempts: 0, isMastered: false });

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.multiStudentComparison({ period: "7d" });

    expect(result.students).toHaveLength(2);

    const s1 = result.students.find((s) => s.id === "student1");
    expect(s1).toBeDefined();
    expect(s1!.errorCount).toBe(2);
    expect(s1!.correctionRate).toBe(0.5); // 1/2
    expect(s1!.masteryRate).toBe(0.5);    // 1/2
    expect(s1!.helpFrequency).toBe(1);

    const s2 = result.students.find((s) => s.id === "student2");
    expect(s2).toBeDefined();
    expect(s2!.errorCount).toBe(1);
    expect(s2!.correctionRate).toBe(0);
    expect(s2!.masteryRate).toBe(0);
    expect(s2!.helpFrequency).toBe(0);
  });

  test("returns empty array when no students", async () => {
    // Create a parent with no students
    const db2 = createMockDb();
    db2._families.push({
      id: "fam2", name: "空家庭", inviteCode: null, inviteCodeExpiresAt: null,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    db2._familyMembers.push(
      { id: "fm10", userId: "parent1", familyId: "fam2", role: "OWNER", joinedAt: new Date() },
    );

    const caller = createCaller(createMockContext(db2, parentCtx));
    const result = await caller.parent.multiStudentComparison({ period: "7d" });
    expect(result.students).toEqual([]);
  });

  test("FORBIDDEN for STUDENT role", async () => {
    const caller = createCaller(createMockContext(db, studentCtx));
    await expect(
      caller.parent.multiStudentComparison({ period: "7d" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("returns student name and grade", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.multiStudentComparison({ period: "7d" });
    const s1 = result.students.find((s) => s.id === "student1");
    expect(s1!.name).toBe("小明");
    expect(s1!.grade).toBe("PRIMARY_3");
  });
});

// ---------- RBAC: non-family student ----------

describe("RBAC: non-family student access", () => {
  beforeEach(setup);

  test("correctionRateDistribution forbidden for non-family student", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    await expect(
      caller.parent.correctionRateDistribution({ studentId: "unknown-student" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("helpFrequencyDetail forbidden for non-family student", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    await expect(
      caller.parent.helpFrequencyDetail({ studentId: "unknown-student" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

// ─── Sprint 18: Learning Suggestions & Intervention Tracking ──────────

describe("US-061: Learning Suggestions", () => {
  beforeEach(setup);

  test("getLearningSuggestions returns empty when no suggestions exist", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.getLearningSuggestions({
      studentId: "student1",
    });
    expect(result.suggestions).toHaveLength(0);
  });

  test("getLearningSuggestions returns suggestions ordered by createdAt desc", async () => {
    const old = new Date("2026-04-10");
    const recent = new Date("2026-04-15");
    db._learningSuggestions.push(
      {
        id: "ls-1", studentId: "student1", type: "WEEKLY_AUTO",
        content: { suggestions: [], attentionItems: [], parentActions: [] },
        weekStart: new Date("2026-04-07"), createdAt: old,
      },
      {
        id: "ls-2", studentId: "student1", type: "ON_DEMAND",
        content: { suggestions: [{ category: "review_priority", title: "Test", description: "Test", relatedKnowledgePoints: [], priority: "high" }], attentionItems: [], parentActions: [] },
        weekStart: new Date("2026-04-14"), createdAt: recent,
      },
    );

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.getLearningSuggestions({
      studentId: "student1",
      limit: 5,
    });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].id).toBe("ls-2"); // Most recent first
    expect(result.suggestions[0].type).toBe("ON_DEMAND");
  });

  test("getLearningSuggestions forbidden for non-family student", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    await expect(
      caller.parent.getLearningSuggestions({ studentId: "unknown-student" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("requestLearningSuggestions is rate-limited to 1 per hour", async () => {
    // Simulate a recent ON_DEMAND suggestion
    db._learningSuggestions.push({
      id: "ls-recent", studentId: "student1", type: "ON_DEMAND",
      content: {}, weekStart: new Date("2026-04-14"),
      createdAt: new Date(), // Just now
    });

    const caller = createCaller(createMockContext(db, parentCtx));
    await expect(
      caller.parent.requestLearningSuggestions({ studentId: "student1" })
    ).rejects.toThrow("cooldown");
  });
});

describe("US-062: Intervention Effect", () => {
  beforeEach(() => {
    setup();
    // Add intervention history
    db._interventionHistories.push(
      {
        id: "ih-1", studentId: "student1", knowledgePointId: "kp-1",
        type: "REVIEW", content: null, agentId: null, skillId: null,
        foundationalWeakness: false, preMasteryStatus: "NEW_ERROR",
        createdAt: new Date("2026-04-14"),
      },
      {
        id: "ih-2", studentId: "student1", knowledgePointId: "kp-2",
        type: "EXPLANATION", content: null, agentId: null, skillId: null,
        foundationalWeakness: true, preMasteryStatus: null,
        createdAt: new Date("2026-04-13"),
      },
    );
    // Add mastery states
    db._masteryStates.push(
      { studentId: "student1", knowledgePointId: "kp-1", status: "CORRECTED" },
      { studentId: "student1", knowledgePointId: "kp-2", status: "REVIEWING" },
    );
  });

  test("interventionEffect returns effects with delta", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.interventionEffect({
      studentId: "student1",
      period: "30d",
    });
    expect(result.effects).toHaveLength(2);

    // kp-1: NEW_ERROR(0) → CORRECTED(1) = delta +1
    const kp1Effect = result.effects.find((e) => e.kpId === "kp-1");
    expect(kp1Effect).toBeDefined();
    expect(kp1Effect!.preMastery).toBe("NEW_ERROR");
    expect(kp1Effect!.postMastery).toBe("CORRECTED");
    expect(kp1Effect!.delta).toBe(1);

    // kp-2: null preMastery → delta 0
    const kp2Effect = result.effects.find((e) => e.kpId === "kp-2");
    expect(kp2Effect).toBeDefined();
    expect(kp2Effect!.preMastery).toBeNull();
    expect(kp2Effect!.delta).toBe(0);
  });

  test("interventionTimeline returns events in desc order", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.interventionTimeline({
      studentId: "student1",
      limit: 20,
    });
    expect(result.events).toHaveLength(2);
    expect(result.events[0].id).toBe("ih-1"); // More recent first
    expect(result.events[0].type).toBe("REVIEW");
    expect(result.events[1].status).toBe("foundational"); // kp-2 is foundational
  });

  test("interventionEffect forbidden for non-family student", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    await expect(
      caller.parent.interventionEffect({ studentId: "unknown-student", period: "7d" })
    ).rejects.toThrow("FORBIDDEN");
  });
});
