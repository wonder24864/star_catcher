/**
 * Acceptance Tests: Error Management Module
 * User Stories: US-020 ~ US-022
 * Sprint: 3
 */
import { describe, test, expect, beforeEach } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;
const studentCtx = { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" };
const parentCtx = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };

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
  db._users.push({
    id: "student1", username: "s1", password: "x", nickname: "小明",
    role: "STUDENT", grade: "PRIMARY_3", locale: "zh", isActive: true,
    deletedAt: null, loginFailCount: 0, lockedUntil: null,
    createdAt: new Date(), updatedAt: new Date(),
  });
}

function addError(id: string, overrides: Partial<{
  subject: string; contentType: string | null; content: string;
  createdAt: Date; isMastered: boolean; totalAttempts: number;
}> = {}) {
  db._errorQuestions.push({
    id,
    studentId: "student1",
    sessionQuestionId: null,
    subject: overrides.subject ?? "MATH",
    contentType: overrides.contentType ?? null,
    grade: null,
    questionType: null,
    content: overrides.content ?? `错题内容-${id}`,
    contentHash: null,
    studentAnswer: "wrong",
    correctAnswer: "right",
    errorAnalysis: null,
    aiKnowledgePoint: null,
    imageUrl: null,
    totalAttempts: overrides.totalAttempts ?? 1,
    correctAttempts: 0,
    isMastered: overrides.isMastered ?? false,
    deletedAt: null,
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
  });
}

describe("US-020: Error Question List", () => {
  beforeEach(setup);

  test("lists error questions with subject color coding (returns subject field)", async () => {
    addError("eq1", { subject: "MATH" });
    addError("eq2", { subject: "CHINESE" });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.list({ page: 1 });

    expect(result.items).toHaveLength(2);
    const subjects = result.items.map((e) => e.subject);
    expect(subjects).toContain("MATH");
    expect(subjects).toContain("CHINESE");
  });

  test("filter by subject", async () => {
    addError("eq1", { subject: "MATH" });
    addError("eq2", { subject: "CHINESE" });
    addError("eq3", { subject: "MATH" });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.list({ subject: "MATH", page: 1 });

    expect(result.items).toHaveLength(2);
    expect(result.items.every((e) => e.subject === "MATH")).toBe(true);
  });

  test("filter by date range", async () => {
    addError("eq1", { createdAt: new Date("2026-04-01T08:00:00Z") });
    addError("eq2", { createdAt: new Date("2026-04-05T08:00:00Z") });
    addError("eq3", { createdAt: new Date("2026-04-10T08:00:00Z") });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.list({
      dateFrom: "2026-04-03",
      dateTo: "2026-04-07",
      page: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("eq2");
  });

  test("pagination shows 20 questions per page", async () => {
    for (let i = 1; i <= 25; i++) {
      addError(`eq${i}`);
    }

    const caller = createCaller(createMockContext(db, studentCtx));
    const page1 = await caller.error.list({ page: 1 });

    expect(page1.items).toHaveLength(20);
    expect(page1.total).toBe(25);
    expect(page1.totalPages).toBe(2);
  });

  test("next/previous page navigation works", async () => {
    for (let i = 1; i <= 25; i++) {
      addError(`eq${i}`);
    }

    const caller = createCaller(createMockContext(db, studentCtx));
    const page2 = await caller.error.list({ page: 2 });

    expect(page2.items).toHaveLength(5);
    expect(page2.page).toBe(2);
  });

  test("search by content keyword", async () => {
    addError("eq1", { content: "分数加减法" });
    addError("eq2", { content: "三角函数求值" });
    addError("eq3", { content: "分数乘法" });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.list({ search: "分数", page: 1 });

    expect(result.items).toHaveLength(2);
    const ids = result.items.map((e) => e.id);
    expect(ids).toContain("eq1");
    expect(ids).toContain("eq3");
  });

  test("parent can list student errors via studentId", async () => {
    addError("eq1", { subject: "MATH" });
    addError("eq2", { subject: "CHINESE" });

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.error.list({ studentId: "student1", page: 1 });

    expect(result.items).toHaveLength(2);
  });

  test("parent FORBIDDEN for non-family student", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    await expect(
      caller.error.list({ studentId: "other-student", page: 1 })
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("US-021: Error Question Detail", () => {
  beforeEach(setup);

  test("STUDENT sees question + own answer, but correctAnswer is stripped", async () => {
    // Stripping is the server-side enforcement of the student/parent boundary
    // introduced with the explanation cache (ADR-013). Previously only the
    // UI hid correctAnswer — now the API contract guarantees students can't
    // see it via DevTools either.
    db._errorQuestions.push({
      id: "eq1", studentId: "student1", sessionQuestionId: null,
      subject: "MATH", contentType: null, grade: null, questionType: null,
      content: "3+4=?", contentHash: null,
      studentAnswer: "8", correctAnswer: "7",
      errorAnalysis: null, aiKnowledgePoint: "加法", imageUrl: null,
      totalAttempts: 2, correctAttempts: 0, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.detail({ id: "eq1" }) as {
      content: string; studentAnswer: string; correctAnswer: string | null; aiKnowledgePoint: string;
    };

    expect(result.content).toBe("3+4=?");
    expect(result.studentAnswer).toBe("8");
    expect(result.correctAnswer).toBeNull(); // stripped for STUDENT
    expect(result.aiKnowledgePoint).toBe("加法");
  });

  test("PARENT sees the full record including correctAnswer + explanation", async () => {
    db._errorQuestions.push({
      id: "eq2", studentId: "student1", sessionQuestionId: null,
      subject: "MATH", contentType: null, grade: null, questionType: null,
      content: "3+4=?", contentHash: null,
      studentAnswer: "8", correctAnswer: "7",
      errorAnalysis: null, aiKnowledgePoint: "加法", imageUrl: null,
      totalAttempts: 2, correctAttempts: 0, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, parentCtx));
    const result = await caller.error.detail({ id: "eq2" }) as {
      content: string; studentAnswer: string; correctAnswer: string | null;
    };

    expect(result.correctAnswer).toBe("7"); // parent can see
  });

  test("shows AI knowledge point annotation", async () => {
    db._errorQuestions.push({
      id: "eq1", studentId: "student1", sessionQuestionId: null,
      subject: "CHINESE", contentType: null, grade: null, questionType: null,
      content: "默写题", contentHash: null,
      studentAnswer: null, correctAnswer: null,
      errorAnalysis: null, aiKnowledgePoint: "汉字书写", imageUrl: null,
      totalAttempts: 1, correctAttempts: 0, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.detail({ id: "eq1" }) as { aiKnowledgePoint: string };
    expect(result.aiKnowledgePoint).toBe("汉字书写");
  });

  test("FORBIDDEN for wrong student", async () => {
    db._errorQuestions.push({
      id: "eq1", studentId: "other-student", sessionQuestionId: null,
      subject: "MATH", contentType: null, grade: null, questionType: null,
      content: "题目", contentHash: null,
      studentAnswer: null, correctAnswer: null,
      errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null,
      totalAttempts: 1, correctAttempts: 0, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentCtx));
    await expect(caller.error.detail({ id: "eq1" })).rejects.toThrow("FORBIDDEN");
  });

  test("detail includes sessionQuestionId for check history link", async () => {
    db._errorQuestions.push({
      id: "eq-linked", studentId: "student1", sessionQuestionId: "sq-orig",
      subject: "MATH", contentType: null, grade: null, questionType: null,
      content: "5+5=?", contentHash: null,
      studentAnswer: "11", correctAnswer: "10",
      errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null,
      totalAttempts: 1, correctAttempts: 0, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.detail({ id: "eq-linked" }) as { sessionQuestionId: string | null };
    expect(result.sessionQuestionId).toBe("sq-orig");
  });

  test("detail returns totalAttempts and correctAttempts for history tracking", async () => {
    db._errorQuestions.push({
      id: "eq-history", studentId: "student1", sessionQuestionId: null,
      subject: "MATH", contentType: null, grade: null, questionType: null,
      content: "7+8=?", contentHash: null,
      studentAnswer: "14", correctAnswer: "15",
      errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null,
      totalAttempts: 3, correctAttempts: 1, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentCtx));
    const result = await caller.error.detail({ id: "eq-history" }) as {
      totalAttempts: number; correctAttempts: number;
    };
    expect(result.totalAttempts).toBe(3);
    expect(result.correctAttempts).toBe(1);
  });
});

describe("US-022: Parent Notes", () => {
  beforeEach(() => {
    setup();
    // Seed a parent user
    db._users.push({
      id: "parent1", username: "p1", password: "x", nickname: "父母",
      role: "PARENT", grade: null, locale: "zh", isActive: true,
      deletedAt: null, loginFailCount: 0, lockedUntil: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    // Seed an error question
    db._errorQuestions.push({
      id: "eq1", studentId: "student1", sessionQuestionId: null,
      subject: "MATH", contentType: null, grade: null, questionType: null,
      content: "2+2=?", contentHash: null,
      studentAnswer: "5", correctAnswer: "4",
      errorAnalysis: null, aiKnowledgePoint: null, imageUrl: null,
      totalAttempts: 1, correctAttempts: 0, isMastered: false,
      deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
  });

  test("parent can add note to error question", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const note = await caller.error.addNote({
      errorQuestionId: "eq1",
      content: "这道题需要多加练习",
    }) as { content: string; parentId: string };

    expect(note.content).toBe("这道题需要多加练习");
    expect(note.parentId).toBe("parent1");
  });

  test("parent can edit own note", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const note = await caller.error.addNote({
      errorQuestionId: "eq1",
      content: "原始备注",
    }) as { id: string };

    const updated = await caller.error.editNote({
      noteId: note.id,
      content: "修改后的备注",
    }) as { content: string };
    expect(updated.content).toBe("修改后的备注");
  });

  test("parent can delete own note", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const note = await caller.error.addNote({
      errorQuestionId: "eq1",
      content: "将被删除的备注",
    }) as { id: string };

    const result = await caller.error.deleteNote({ noteId: note.id });
    expect(result).toEqual({ success: true });

    // Note should no longer appear in detail
    const detail = await caller.error.detail({ id: "eq1" }) as { parentNotes: unknown[] };
    expect(detail.parentNotes).toHaveLength(0);
  });

  test("note input enforces 500 character limit", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    const tooLong = "a".repeat(501);
    await expect(
      caller.error.addNote({ errorQuestionId: "eq1", content: tooLong })
    ).rejects.toThrow();
  });

  test("notes display author and timestamp", async () => {
    const caller = createCaller(createMockContext(db, parentCtx));
    await caller.error.addNote({ errorQuestionId: "eq1", content: "备注内容" });

    const detail = await caller.error.detail({ id: "eq1" }) as {
      parentNotes: Array<{ content: string; parent: { nickname: string } | null; createdAt: unknown }>;
    };
    expect(detail.parentNotes).toHaveLength(1);
    expect(detail.parentNotes[0].content).toBe("备注内容");
    expect(detail.parentNotes[0].parent?.nickname).toBe("父母");
    expect(detail.parentNotes[0].createdAt).toBeDefined();
  });
});
