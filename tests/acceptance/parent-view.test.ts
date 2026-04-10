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
  test.todo("shows upload → recognition → check → correction timeline")
  test.todo("shows each round score change")
})

describe("US-025: Statistics", () => {
  test.todo("error quantity trends (daily/weekly/monthly)")
  test.todo("subject distribution pie chart")
  test.todo("average score trends")
  test.todo("correction success rate")
  test.todo("help frequency analysis")
  test.todo("renders trend chart with correct data points")
  test.todo("renders subject distribution pie chart")
})

describe("US-026: Parent Settings", () => {
  test.todo("set answer reveal strategy per student")
  test.todo("maxHelpLevel setting per student")
})
