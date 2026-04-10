/**
 * Acceptance Tests: Parent View Module
 * User Stories: US-023 ~ US-026
 * Sprint: 3
 */
import { describe, test, expect, beforeEach } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;
const parentCtx = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };

function setup() {
  db = createMockDb();
  // Family setup
  db._families.push({
    id: "fam1", name: "家庭", inviteCode: null, inviteCodeExpiresAt: null,
    deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  db._familyMembers.push(
    { id: "fm1", userId: "parent1", familyId: "fam1", role: "OWNER", joinedAt: new Date() },
    { id: "fm2", userId: "student1", familyId: "fam1", role: "MEMBER", joinedAt: new Date() }
  );
}

function addSession(id: string, date: string, overrides: Record<string, unknown> = {}) {
  db._homeworkSessions.push({
    id,
    studentId: "student1",
    createdBy: "student1",
    subject: "MATH",
    contentType: null,
    grade: null,
    title: `作业-${id}`,
    status: "COMPLETED",
    finalScore: 80,
    totalRounds: 1,
    createdAt: new Date(`${date}T08:00:00.000Z`),
    updatedAt: new Date(),
    ...overrides,
  });
}

function addHelp(sessionId: string, questionId: string, level: number) {
  db._helpRequests.push({
    id: `hr-${sessionId}-${questionId}-${level}`,
    homeworkSessionId: sessionId,
    sessionQuestionId: questionId,
    level,
    aiResponse: `level ${level} response`,
    createdAt: new Date(),
  });
}

describe("US-023: Daily Overview", () => {
  beforeEach(setup);

  test("shows today homework check list", async () => {
    addSession("hw1", "2026-04-10");
    addSession("hw2", "2026-04-10");
    addSession("hw3", "2026-04-09"); // different date, should not appear

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });

    expect(result).toHaveLength(2);
    const ids = result.map((s) => s.id);
    expect(ids).toContain("hw1");
    expect(ids).toContain("hw2");
    expect(ids).not.toContain("hw3");
  });

  test("shows per-homework stats: score, totalRounds, subject, status", async () => {
    addSession("hw1", "2026-04-10", { finalScore: 95, totalRounds: 3, status: "COMPLETED", subject: "MATH" });

    const caller = createCaller(createMockContext(db, parentCtx));
    const [session] = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });

    expect(session.finalScore).toBe(95);
    expect(session.totalRounds).toBe(3);
    expect(session.status).toBe("COMPLETED");
    expect(session.subject).toBe("MATH");
  });

  test("shows help usage per question grouped by level", async () => {
    addSession("hw1", "2026-04-10");
    addHelp("hw1", "q1", 1);
    addHelp("hw1", "q2", 1);
    addHelp("hw1", "q3", 2);
    addHelp("hw1", "q4", 3);

    const caller = createCaller(createMockContext(db, parentCtx));
    const [session] = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });

    expect(session.helpByLevel[1]).toBe(2); // L1 × 2
    expect(session.helpByLevel[2]).toBe(1); // L2 × 1
    expect(session.helpByLevel[3]).toBe(1); // L3 × 1
  });

  test("shows weekly calendar check-in with correct days", async () => {
    // Add sessions on Mon and Thu of week 2026-04-07
    addSession("hw1", "2026-04-07"); // Monday
    addSession("hw2", "2026-04-10"); // Thursday

    const caller = createCaller(createMockContext(db, parentCtx));
    const week = await caller.parent.weeklyCheckin({
      studentId: "student1",
      weekStart: "2026-04-07",
    });

    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({ date: "2026-04-07", hasSession: true });  // Mon
    expect(week[1]).toEqual({ date: "2026-04-08", hasSession: false }); // Tue
    expect(week[3]).toEqual({ date: "2026-04-10", hasSession: true });  // Thu
    expect(week[6]).toEqual({ date: "2026-04-13", hasSession: false }); // Sun
  });

  test("returns empty session list when no checks on selected date", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });
    expect(result).toHaveLength(0);
  });

  test("history date lookup returns sessions for that date only", async () => {
    addSession("hw-old", "2026-04-01");
    addSession("hw-today", "2026-04-10");

    const caller = createCaller(createMockContext(db, parentCtx));

    const historyResult = await caller.parent.overview({ studentId: "student1", date: "2026-04-01" });
    expect(historyResult).toHaveLength(1);
    expect(historyResult[0].id).toBe("hw-old");

    const todayResult = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });
    expect(todayResult).toHaveLength(1);
    expect(todayResult[0].id).toBe("hw-today");
  });
});

describe("US-024: Session Detail Timeline", () => {
  beforeEach(setup);

  test("shows each round score change via sessionDetail", async () => {
    addSession("hw1", "2026-04-10", { status: "COMPLETED", finalScore: 90 });
    // Seed two check rounds
    db._checkRounds.push(
      { id: "r1", homeworkSessionId: "hw1", roundNumber: 1, score: 70, totalQuestions: 5, correctCount: 3, createdAt: new Date() },
      { id: "r2", homeworkSessionId: "hw1", roundNumber: 2, score: 90, totalQuestions: 5, correctCount: 4, createdAt: new Date() }
    );

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.sessionDetail({ sessionId: "hw1" });

    const rounds = (result as unknown as { checkRounds: { roundNumber: number; score: number | null }[] }).checkRounds;
    expect(rounds).toHaveLength(2);
    expect(rounds[0].roundNumber).toBe(1);
    expect(rounds[0].score).toBe(70);
    expect(rounds[1].roundNumber).toBe(2);
    expect(rounds[1].score).toBe(90);
  });

  test("shows help records attached to session", async () => {
    addSession("hw1", "2026-04-10");
    db._sessionQuestions.push({
      id: "q1", homeworkSessionId: "hw1", questionNumber: 1, questionType: null,
      content: "2+2=?", studentAnswer: "3", correctAnswer: null, isCorrect: false,
      confidence: null, needsReview: false, imageRegion: null, aiKnowledgePoint: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    addHelp("hw1", "q1", 1);
    addHelp("hw1", "q1", 2);

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.sessionDetail({ sessionId: "hw1" });

    const helpReqs = (result as unknown as { helpRequests: { level: number }[] }).helpRequests;
    expect(helpReqs).toHaveLength(2);
    expect(helpReqs.map((h) => h.level)).toEqual([1, 2]);
  });

  test("forbidden for STUDENT role", async () => {
    setup();
    const studentCtx = { userId: "student1", role: "STUDENT", grade: null, locale: "zh" };
    const caller = createCaller(createMockContext(db, studentCtx));
    addSession("hw1", "2026-04-10");
    await expect(caller.parent.sessionDetail({ sessionId: "hw1" })).rejects.toThrow("FORBIDDEN");
  });
})

describe("US-025: Statistics", () => {
  beforeEach(setup);

  test("error quantity trends grouped by day", async () => {
    // 2 errors today, 1 error yesterday
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    db._errorQuestions.push(
      { id: "eq1", studentId: "student1", sessionQuestionId: null, subject: "MATH", contentType: null, grade: null, questionType: null, content: "q1", contentHash: null, studentAnswer: null, correctAnswer: null, errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null, totalAttempts: 1, correctAttempts: 0, isMastered: false, deletedAt: null, createdAt: new Date(`${today}T08:00:00Z`), updatedAt: new Date() },
      { id: "eq2", studentId: "student1", sessionQuestionId: null, subject: "MATH", contentType: null, grade: null, questionType: null, content: "q2", contentHash: null, studentAnswer: null, correctAnswer: null, errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null, totalAttempts: 1, correctAttempts: 0, isMastered: false, deletedAt: null, createdAt: new Date(`${today}T09:00:00Z`), updatedAt: new Date() },
      { id: "eq3", studentId: "student1", sessionQuestionId: null, subject: "CHINESE", contentType: null, grade: null, questionType: null, content: "q3", contentHash: null, studentAnswer: null, correctAnswer: null, errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null, totalAttempts: 1, correctAttempts: 0, isMastered: false, deletedAt: null, createdAt: new Date(`${yesterday}T08:00:00Z`), updatedAt: new Date() },
    );

    const caller = createCaller(createMockContext(db, parentCtx));
    const stats = await caller.parent.stats({ studentId: "student1", period: "7d" });

    expect(stats.totalErrors).toBe(3);
    const todayEntry = stats.errorsByDay.find((d) => d.date === today);
    expect(todayEntry?.count).toBe(2);
    const yestEntry = stats.errorsByDay.find((d) => d.date === yesterday);
    expect(yestEntry?.count).toBe(1);
  });

  test("subject distribution pie chart data", async () => {
    const today = new Date().toISOString().slice(0, 10);
    db._errorQuestions.push(
      { id: "eq1", studentId: "student1", sessionQuestionId: null, subject: "MATH", contentType: null, grade: null, questionType: null, content: "q1", contentHash: null, studentAnswer: null, correctAnswer: null, errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null, totalAttempts: 1, correctAttempts: 0, isMastered: false, deletedAt: null, createdAt: new Date(`${today}T08:00:00Z`), updatedAt: new Date() },
      { id: "eq2", studentId: "student1", sessionQuestionId: null, subject: "MATH", contentType: null, grade: null, questionType: null, content: "q2", contentHash: null, studentAnswer: null, correctAnswer: null, errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null, totalAttempts: 1, correctAttempts: 0, isMastered: false, deletedAt: null, createdAt: new Date(`${today}T09:00:00Z`), updatedAt: new Date() },
      { id: "eq3", studentId: "student1", sessionQuestionId: null, subject: "CHINESE", contentType: null, grade: null, questionType: null, content: "q3", contentHash: null, studentAnswer: null, correctAnswer: null, errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null, totalAttempts: 1, correctAttempts: 0, isMastered: false, deletedAt: null, createdAt: new Date(`${today}T10:00:00Z`), updatedAt: new Date() },
    );

    const caller = createCaller(createMockContext(db, parentCtx));
    const stats = await caller.parent.stats({ studentId: "student1", period: "7d" });

    expect(stats.subjectDistribution[0]).toEqual({ subject: "MATH", count: 2 });
    expect(stats.subjectDistribution[1]).toEqual({ subject: "CHINESE", count: 1 });
  });

  test("daily check count and average score trends", async () => {
    const today = new Date().toISOString().slice(0, 10);
    addSession("hw1", today, { status: "COMPLETED", finalScore: 80 });
    addSession("hw2", today, { status: "COMPLETED", finalScore: 100 });

    const caller = createCaller(createMockContext(db, parentCtx));
    const stats = await caller.parent.stats({ studentId: "student1", period: "7d" });

    const todayCheck = stats.checkCountByDay.find((d) => d.date === today);
    expect(todayCheck?.count).toBe(2);
    const todayScore = stats.avgScoreByDay.find((d) => d.date === today);
    expect(todayScore?.avgScore).toBe(90);
  });

  test.todo("correction success rate")
  test.todo("help frequency analysis")
})

describe("US-026: Parent Settings", () => {
  beforeEach(setup);

  test("set maxHelpLevel for a specific student", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.parent.setMaxHelpLevel({ studentId: "student1", maxHelpLevel: 1 });
    expect(result.maxHelpLevel).toBe(1);
  });

  test("getStudentConfigs returns default level based on grade", async () => {
    db._users.push({
      id: "student1", username: "s1", password: "x", nickname: "小明",
      role: "STUDENT", grade: "PRIMARY_3", locale: "zh", isActive: true,
      deletedAt: null, loginFailCount: 0, lockedUntil: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, parentCtx));
    const configs = await caller.parent.getStudentConfigs();

    expect(configs).toHaveLength(1);
    expect(configs[0].studentId).toBe("student1");
    // PRIMARY grade → default 2
    expect(configs[0].maxHelpLevel).toBe(2);
  });

  test("setMaxHelpLevel then getStudentConfigs returns updated value", async () => {
    db._users.push({
      id: "student1", username: "s1", password: "x", nickname: "小明",
      role: "STUDENT", grade: "JUNIOR_1", locale: "zh", isActive: true,
      deletedAt: null, loginFailCount: 0, lockedUntil: null,
      createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, parentCtx));
    await caller.parent.setMaxHelpLevel({ studentId: "student1", maxHelpLevel: 1 });

    const configs = await caller.parent.getStudentConfigs();
    expect(configs[0].maxHelpLevel).toBe(1);
  });
})
