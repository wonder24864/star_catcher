/**
 * Unit Tests: Parent Router
 * Tests tRPC parent procedures (overview, weeklyCheckin) with mocked DB.
 */
import { describe, test, expect, beforeEach } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;

const parentSession = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };
const studentSession = { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" };

function seedFamily() {
  db._families.push({
    id: "fam1",
    name: "Test Family",
    inviteCode: null,
    inviteCodeExpiresAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db._familyMembers.push(
    { id: "fm1", userId: "parent1", familyId: "fam1", role: "OWNER", joinedAt: new Date() },
    { id: "fm2", userId: "student1", familyId: "fam1", role: "MEMBER", joinedAt: new Date() }
  );
}

function seedSession(overrides: { id?: string; createdAt?: Date; status?: string; finalScore?: number | null } = {}) {
  const session = {
    id: overrides.id ?? "hw1",
    studentId: "student1",
    createdBy: "student1",
    subject: "MATH" as const,
    contentType: null,
    grade: null,
    title: "数学作业",
    status: overrides.status ?? "COMPLETED",
    finalScore: overrides.finalScore ?? 85,
    totalRounds: 2,
    createdAt: overrides.createdAt ?? new Date("2026-04-10T08:00:00.000Z"),
    updatedAt: new Date(),
  };
  db._homeworkSessions.push(session);
  return session;
}

function seedHelpRequest(sessionId: string, questionId: string, level: number) {
  db._helpRequests.push({
    id: `hr-${sessionId}-${level}`,
    homeworkSessionId: sessionId,
    sessionQuestionId: questionId,
    level,
    aiResponse: `Level ${level} help`,
    createdAt: new Date(),
  });
}

beforeEach(() => {
  db = createMockDb();
});

describe("parent.overview", () => {
  test("STUDENT role is forbidden", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.parent.overview({ studentId: "student1", date: "2026-04-10" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("parent without family relationship is forbidden", async () => {
    // No family seeded
    const caller = createCaller(createMockContext(db, parentSession));
    await expect(
      caller.parent.overview({ studentId: "student1", date: "2026-04-10" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("returns sessions for the requested date", async () => {
    seedFamily();
    seedSession({ id: "hw1", createdAt: new Date("2026-04-10T08:00:00.000Z") });
    // Session on a different date - should NOT appear
    seedSession({ id: "hw2", createdAt: new Date("2026-04-11T08:00:00.000Z") });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("hw1");
  });

  test("aggregates help requests by level", async () => {
    seedFamily();
    seedSession({ id: "hw1", createdAt: new Date("2026-04-10T08:00:00.000Z") });
    seedHelpRequest("hw1", "q1", 1);
    seedHelpRequest("hw1", "q2", 1);
    seedHelpRequest("hw1", "q3", 2);

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });

    expect(result[0].helpByLevel[1]).toBe(2); // 2 × L1
    expect(result[0].helpByLevel[2]).toBe(1); // 1 × L2
    expect(result[0].helpByLevel[3]).toBeUndefined();
  });

  test("returns empty list when no sessions on that date", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });
    expect(result).toHaveLength(0);
  });

  test("includes finalScore and totalRounds in response", async () => {
    seedFamily();
    seedSession({ id: "hw1", createdAt: new Date("2026-04-10T08:00:00.000Z"), finalScore: 90, status: "COMPLETED" });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.overview({ studentId: "student1", date: "2026-04-10" });

    expect(result[0].finalScore).toBe(90);
    expect(result[0].totalRounds).toBe(2);
    expect(result[0].status).toBe("COMPLETED");
  });
});

describe("parent.weeklyCheckin", () => {
  test("STUDENT role is forbidden", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.parent.weeklyCheckin({ studentId: "student1", weekStart: "2026-04-07" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("returns 7 days for the week", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.weeklyCheckin({
      studentId: "student1",
      weekStart: "2026-04-07",
    });
    expect(result).toHaveLength(7);
    expect(result[0].date).toBe("2026-04-07"); // Monday
    expect(result[6].date).toBe("2026-04-13"); // Sunday
  });

  test("marks days with sessions as hasSession=true", async () => {
    seedFamily();
    // Session on Wednesday 2026-04-09
    seedSession({ id: "hw1", createdAt: new Date("2026-04-09T08:00:00.000Z") });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.weeklyCheckin({
      studentId: "student1",
      weekStart: "2026-04-07",
    });

    // Day index 2 = Wednesday (Mon=0, Tue=1, Wed=2)
    expect(result[2].date).toBe("2026-04-09");
    expect(result[2].hasSession).toBe(true);

    // Other days should be false
    expect(result[0].hasSession).toBe(false);
    expect(result[1].hasSession).toBe(false);
  });

  test("excludes sessions outside the week window", async () => {
    seedFamily();
    // Session outside the queried week
    seedSession({ id: "hw1", createdAt: new Date("2026-04-14T08:00:00.000Z") });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.weeklyCheckin({
      studentId: "student1",
      weekStart: "2026-04-07",
    });

    expect(result.every((d) => !d.hasSession)).toBe(true);
  });
});
