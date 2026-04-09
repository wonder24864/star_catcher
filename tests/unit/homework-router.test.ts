/**
 * Unit Tests: Homework Router
 * Tests tRPC homework procedures with mocked DB and storage.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

vi.mock("@/lib/storage", () => import("../helpers/mock-storage"));
import { storageCalls, resetStorageCalls } from "../helpers/mock-storage";

// Mock AI operations used by submitCorrections
vi.mock("@/lib/ai/operations/grade-answer", () => ({
  gradeAnswer: vi.fn().mockResolvedValue({
    success: true,
    data: { isCorrect: true, confidence: 0.95 },
  }),
}));
import { gradeAnswer } from "@/lib/ai/operations/grade-answer";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;
const studentSession = { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" };
const parentSession = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };

function seedFamily() {
  db._families.push({
    id: "family1", name: "Test Family", inviteCode: null,
    inviteCodeExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  db._familyMembers.push(
    { id: "fm1", userId: "parent1", familyId: "family1", role: "OWNER", joinedAt: new Date() },
    { id: "fm2", userId: "student1", familyId: "family1", role: "MEMBER", joinedAt: new Date() },
  );
}

function seedSession(overrides?: Partial<{ id: string; status: string; createdBy: string; studentId: string }>) {
  const session = {
    id: overrides?.id ?? "hw-session-1",
    studentId: overrides?.studentId ?? "student1",
    createdBy: overrides?.createdBy ?? "student1",
    subject: null, contentType: null, grade: null, title: null,
    status: overrides?.status ?? "CREATED",
    finalScore: null, totalRounds: 0,
    createdAt: new Date(), updatedAt: new Date(),
  };
  db._homeworkSessions.push(session);
  return session;
}

function seedImage(sessionId: string, objectKey: string, sortOrder: number = 0) {
  const image = {
    id: `img-${db._homeworkImages.length + 1}`,
    homeworkSessionId: sessionId,
    imageUrl: objectKey,
    originalFilename: `img${sortOrder}.jpg`,
    sortOrder,
    exifRotation: 0,
    privacyStripped: true,
    createdAt: new Date(),
  };
  db._homeworkImages.push(image);
  return image;
}

beforeEach(() => {
  db = createMockDb();
  resetStorageCalls();
});

describe("homework.createSession", () => {
  test("student creates session for themselves", async () => {
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.createSession({ studentId: "student1" });

    expect(result.id).toBeTruthy();
    expect(db._homeworkSessions).toHaveLength(1);
    expect(db._homeworkSessions[0].studentId).toBe("student1");
    expect(db._homeworkSessions[0].createdBy).toBe("student1");
    expect(db._homeworkSessions[0].status).toBe("CREATED");
  });

  test("rejects unauthenticated users", async () => {
    const caller = createCaller(createMockContext(db, null));
    await expect(
      caller.homework.createSession({ studentId: "student1" })
    ).rejects.toThrow("UNAUTHORIZED");
  });

  test("parent creates session for family student", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.homework.createSession({ studentId: "student1" });

    expect(result.id).toBeTruthy();
    expect(db._homeworkSessions[0].createdBy).toBe("parent1");
    expect(db._homeworkSessions[0].studentId).toBe("student1");
  });

  test("parent cannot create session for non-family student", async () => {
    // No family relationship
    const caller = createCaller(createMockContext(db, parentSession));
    await expect(
      caller.homework.createSession({ studentId: "student1" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("student cannot create session for another student", async () => {
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.createSession({ studentId: "other-student" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("homework.getSession", () => {
  test("returns session with images ordered by sortOrder", async () => {
    seedSession();
    seedImage("hw-session-1", "img2.jpg", 2);
    seedImage("hw-session-1", "img0.jpg", 0);
    seedImage("hw-session-1", "img1.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.getSession({ sessionId: "hw-session-1" });

    expect(result.id).toBe("hw-session-1");
    expect(result.images).toHaveLength(3);
    expect(result.images[0].sortOrder).toBe(0);
    expect(result.images[1].sortOrder).toBe(1);
    expect(result.images[2].sortOrder).toBe(2);
  });

  test("rejects non-owner access", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.getSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("parent can view family student session", async () => {
    seedFamily();
    seedSession();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.homework.getSession({ sessionId: "hw-session-1" });
    expect(result.id).toBe("hw-session-1");
  });
});

describe("homework.listSessions", () => {
  test("returns sessions for student in desc order", async () => {
    const s1 = seedSession({ id: "s1" });
    s1.createdAt = new Date("2026-01-01");
    const s2 = seedSession({ id: "s2" });
    s2.createdAt = new Date("2026-01-02");

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.listSessions({ studentId: "student1" });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s2"); // Newer first
    expect(result[1].id).toBe("s1");
  });

  test("respects limit parameter", async () => {
    seedSession({ id: "s1" });
    seedSession({ id: "s2" });
    seedSession({ id: "s3" });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.listSessions({ studentId: "student1", limit: 2 });
    expect(result).toHaveLength(2);
  });

  test("includes image count", async () => {
    seedSession();
    seedImage("hw-session-1", "a.jpg", 0);
    seedImage("hw-session-1", "b.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.listSessions({ studentId: "student1" });

    expect(result[0]._count.images).toBe(2);
  });
});

describe("homework.updateImageOrder", () => {
  test("updates sortOrder for each image", async () => {
    seedSession();
    const img1 = seedImage("hw-session-1", "a.jpg", 0);
    const img2 = seedImage("hw-session-1", "b.jpg", 1);
    const img3 = seedImage("hw-session-1", "c.jpg", 2);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.updateImageOrder({
      sessionId: "hw-session-1",
      imageIds: [img3.id, img1.id, img2.id], // Reversed order
    });

    expect(result.success).toBe(true);
    expect(db._homeworkImages.find((i) => i.id === img3.id)?.sortOrder).toBe(0);
    expect(db._homeworkImages.find((i) => i.id === img1.id)?.sortOrder).toBe(1);
    expect(db._homeworkImages.find((i) => i.id === img2.id)?.sortOrder).toBe(2);
  });

  test("rejects if session is not CREATED", async () => {
    seedSession({ status: "CHECKING" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.updateImageOrder({
        sessionId: "hw-session-1",
        imageIds: ["img1"],
      })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });
});

describe("homework.deleteSession", () => {
  test("deletes session and all images from DB", async () => {
    seedSession();
    seedImage("hw-session-1", "a.jpg", 0);
    seedImage("hw-session-1", "b.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.deleteSession({ sessionId: "hw-session-1" });

    expect(result.success).toBe(true);
    expect(db._homeworkSessions).toHaveLength(0);
    expect(db._homeworkImages).toHaveLength(0);
  });

  test("calls deleteObject for each image in MinIO", async () => {
    seedSession();
    seedImage("hw-session-1", "homework/s1/a.jpg", 0);
    seedImage("hw-session-1", "homework/s1/b.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.deleteSession({ sessionId: "hw-session-1" });

    expect(storageCalls.deletedObjects).toContain("homework/s1/a.jpg");
    expect(storageCalls.deletedObjects).toContain("homework/s1/b.jpg");
  });

  test("rejects if session is not CREATED", async () => {
    seedSession({ status: "COMPLETED" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.deleteSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.deleteSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

// --- Question CRUD tests (Task 18) ---

function seedQuestion(sessionId: string, overrides?: Partial<{ id: string; questionNumber: number; content: string; isCorrect: boolean | null; confidence: number }>) {
  const q = {
    id: overrides?.id ?? `q-${db._sessionQuestions.length + 1}`,
    homeworkSessionId: sessionId,
    questionNumber: overrides?.questionNumber ?? db._sessionQuestions.length + 1,
    questionType: "CALCULATION" as string | null,
    content: overrides?.content ?? "25 + 38 = ?",
    studentAnswer: "63",
    correctAnswer: "63",
    isCorrect: overrides?.isCorrect ?? true,
    confidence: overrides?.confidence ?? 0.9,
    needsReview: false,
    imageRegion: null,
    aiKnowledgePoint: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db._sessionQuestions.push(q);
  return q;
}

describe("homework.updateQuestion", () => {
  test("updates question fields", async () => {
    seedSession({ status: "RECOGNIZED" });
    const q = seedQuestion("hw-session-1", { isCorrect: false });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.updateQuestion({
      questionId: q.id,
      isCorrect: true,
      studentAnswer: "63",
    });

    expect(result.isCorrect).toBe(true);
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other", status: "RECOGNIZED" });
    const q = seedQuestion("hw-session-1");

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.updateQuestion({ questionId: q.id, isCorrect: false })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("rejects for nonexistent question", async () => {
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.updateQuestion({ questionId: "nonexistent", isCorrect: true })
    ).rejects.toThrow("QUESTION_NOT_FOUND");
  });
});

describe("homework.deleteQuestion", () => {
  test("deletes a question", async () => {
    seedSession({ status: "RECOGNIZED" });
    const q = seedQuestion("hw-session-1");

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.deleteQuestion({ questionId: q.id });

    expect(result.success).toBe(true);
    expect(db._sessionQuestions).toHaveLength(0);
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const q = seedQuestion("hw-session-1");

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.deleteQuestion({ questionId: q.id })
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("homework.addQuestion", () => {
  test("adds a question with next questionNumber", async () => {
    seedSession({ status: "RECOGNIZED" });
    seedQuestion("hw-session-1", { questionNumber: 1 });
    seedQuestion("hw-session-1", { questionNumber: 2 });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.addQuestion({
      sessionId: "hw-session-1",
      content: "New question: 10 × 5 = ?",
      studentAnswer: "50",
      correctAnswer: "50",
    });

    expect(result.questionNumber).toBe(3);
    expect(result.content).toBe("New question: 10 × 5 = ?");
    expect(result.confidence).toBe(1.0); // Manually added
    expect(db._sessionQuestions).toHaveLength(3);
  });

  test("rejects if session is not editable", async () => {
    seedSession({ status: "CHECKING" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.addQuestion({
        sessionId: "hw-session-1",
        content: "test",
      })
    ).rejects.toThrow("SESSION_NOT_EDITABLE");
  });
});

describe("homework.confirmResults", () => {
  test("transitions session to CHECKING status", async () => {
    seedSession({ status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.confirmResults({ sessionId: "hw-session-1" });

    expect(result.status).toBe("CHECKING");
  });

  test("updates subject and grade if provided", async () => {
    seedSession({ status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.confirmResults({
      sessionId: "hw-session-1",
      subject: "MATH",
      grade: "PRIMARY_3",
    });

    expect(result.status).toBe("CHECKING");
    expect(result.subject).toBe("MATH");
    expect(result.grade).toBe("PRIMARY_3");
  });

  test("creates CheckRound #1 from OCR isCorrect values", async () => {
    seedSession({ status: "RECOGNIZED" });
    seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: true });
    seedQuestion("hw-session-1", { questionNumber: 2, isCorrect: false });
    seedQuestion("hw-session-1", { questionNumber: 3, isCorrect: true });

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.confirmResults({ sessionId: "hw-session-1" });

    expect(db._checkRounds).toHaveLength(1);
    const round = db._checkRounds[0];
    expect(round.roundNumber).toBe(1);
    expect(round.totalQuestions).toBe(3);
    expect(round.correctCount).toBe(2);
    expect(round.score).toBe(67); // round(2/3 * 100)
    expect(db._roundQuestionResults).toHaveLength(3);
  });

  test("creates CheckRound #1 with null score when session has no questions", async () => {
    seedSession({ status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.confirmResults({ sessionId: "hw-session-1" });

    expect(db._checkRounds).toHaveLength(1);
    expect(db._checkRounds[0].score).toBeNull();
    expect(db._checkRounds[0].totalQuestions).toBe(0);
    expect(db._roundQuestionResults).toHaveLength(0);
  });

  test("sets totalRounds to 1 on session", async () => {
    seedSession({ status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.confirmResults({ sessionId: "hw-session-1" });

    expect(db._homeworkSessions[0].totalRounds).toBe(1);
  });

  test("rejects if session is not in RECOGNIZED status", async () => {
    seedSession({ status: "CREATED" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.confirmResults({ sessionId: "hw-session-1" })
    ).rejects.toThrow("SESSION_NOT_IN_RECOGNIZED_STATUS");
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other", status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.confirmResults({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

// --- Check flow state machine tests (Task 19) ---

describe("homework.getCheckStatus", () => {
  test("returns session with rounds and per-question results", async () => {
    seedSession({ status: "CHECKING" });
    const q1 = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: true });
    const q2 = seedQuestion("hw-session-1", { questionNumber: 2, isCorrect: false });
    // Simulate round already created (as confirmResults would do)
    db._checkRounds.push({
      id: "round-1",
      homeworkSessionId: "hw-session-1",
      roundNumber: 1,
      score: 50,
      totalQuestions: 2,
      correctCount: 1,
      createdAt: new Date(),
    });
    db._roundQuestionResults.push(
      { id: "rr1", checkRoundId: "round-1", sessionQuestionId: q1.id, studentAnswer: "63", isCorrect: true, correctedFromPrev: false },
      { id: "rr2", checkRoundId: "round-1", sessionQuestionId: q2.id, studentAnswer: "10", isCorrect: false, correctedFromPrev: false },
    );

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.getCheckStatus({ sessionId: "hw-session-1" });

    expect(result.status).toBe("CHECKING");
    expect(result.questions).toHaveLength(2);
    expect(result.checkRounds).toHaveLength(1);
    expect(result.checkRounds[0].roundNumber).toBe(1);
    expect(result.checkRounds[0].score).toBe(50);
    expect(result.checkRounds[0].results).toHaveLength(2);
  });

  test("is accessible by a family parent", async () => {
    seedFamily();
    seedSession({ status: "CHECKING" });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.homework.getCheckStatus({ sessionId: "hw-session-1" });
    expect(result.sessionId ?? result.id).toBeTruthy();
  });

  test("rejects if session is not in check phase", async () => {
    seedSession({ status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.getCheckStatus({ sessionId: "hw-session-1" })
    ).rejects.toThrow("SESSION_NOT_IN_CHECK_PHASE");
  });

  test("rejects for non-owner non-parent", async () => {
    seedSession({ createdBy: "other", studentId: "other", status: "CHECKING" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.getCheckStatus({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("returns COMPLETED session (review after completion)", async () => {
    seedSession({ status: "COMPLETED" });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.getCheckStatus({ sessionId: "hw-session-1" });
    expect(result.status).toBe("COMPLETED");
  });
});

describe("homework.completeSession", () => {
  test("transitions CHECKING → COMPLETED with last round score", async () => {
    seedSession({ status: "CHECKING" });
    db._checkRounds.push({
      id: "round-1",
      homeworkSessionId: "hw-session-1",
      roundNumber: 1,
      score: 80,
      totalQuestions: 5,
      correctCount: 4,
      createdAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.completeSession({ sessionId: "hw-session-1" });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalScore).toBe(80);
  });

  test("sets finalScore from the highest roundNumber when multiple rounds exist", async () => {
    seedSession({ status: "CHECKING" });
    db._checkRounds.push(
      { id: "round-1", homeworkSessionId: "hw-session-1", roundNumber: 1, score: 60, totalQuestions: 5, correctCount: 3, createdAt: new Date() },
      { id: "round-2", homeworkSessionId: "hw-session-1", roundNumber: 2, score: 100, totalQuestions: 5, correctCount: 5, createdAt: new Date() },
    );

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.completeSession({ sessionId: "hw-session-1" });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalScore).toBe(100);
  });

  test("sets finalScore to null when no rounds exist", async () => {
    seedSession({ status: "CHECKING" });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.completeSession({ sessionId: "hw-session-1" });

    expect(result.status).toBe("COMPLETED");
    expect(result.finalScore).toBeNull();
  });

  test("rejects if session is not in CHECKING status", async () => {
    seedSession({ status: "RECOGNIZED" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.completeSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("SESSION_NOT_IN_CHECKING_STATUS");
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other", status: "CHECKING" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.completeSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("homework.submitCorrections", () => {
  beforeEach(() => {
    vi.mocked(gradeAnswer).mockResolvedValue({
      success: true,
      data: { isCorrect: true, confidence: 0.95 },
    });
  });

  test("grades corrections, creates new round, updates totalRounds", async () => {
    seedSession({ status: "CHECKING" });
    const q1 = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: true });
    const q2 = seedQuestion("hw-session-1", { questionNumber: 2, isCorrect: false });
    db._checkRounds.push({
      id: "round-1", homeworkSessionId: "hw-session-1", roundNumber: 1,
      score: 50, totalQuestions: 2, correctCount: 1, createdAt: new Date(),
    });
    db._homeworkSessions[0].totalRounds = 1; // Reflect the seeded round

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.submitCorrections({
      sessionId: "hw-session-1",
      corrections: [{ questionId: q2.id, newAnswer: "correct answer" }],
    });

    expect(result.success).toBe(true);
    expect(result.newRoundNumber).toBe(2);
    expect(result.score).toBe(100); // AI says isCorrect=true, both now correct
    expect(db._checkRounds).toHaveLength(2);
    expect(db._checkRounds[1].roundNumber).toBe(2);
    expect(db._homeworkSessions[0].totalRounds).toBe(2);
  });

  test("updates SessionQuestion with new answer and isCorrect", async () => {
    seedSession({ status: "CHECKING" });
    const q = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: false });
    db._checkRounds.push({
      id: "round-1", homeworkSessionId: "hw-session-1", roundNumber: 1,
      score: 0, totalQuestions: 1, correctCount: 0, createdAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.submitCorrections({
      sessionId: "hw-session-1",
      corrections: [{ questionId: q.id, newAnswer: "new answer" }],
    });

    const updated = db._sessionQuestions.find((sq) => sq.id === q.id);
    expect(updated?.studentAnswer).toBe("new answer");
    expect(updated?.isCorrect).toBe(true);
  });

  test("marks question as needsReview when AI fails", async () => {
    vi.mocked(gradeAnswer).mockResolvedValueOnce({
      success: false,
      error: { message: "AI error", code: "AI_CALL_FAILED", retryable: true },
    });

    seedSession({ status: "CHECKING" });
    const q = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: false });
    db._checkRounds.push({
      id: "round-1", homeworkSessionId: "hw-session-1", roundNumber: 1,
      score: 0, totalQuestions: 1, correctCount: 0, createdAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.submitCorrections({
      sessionId: "hw-session-1",
      corrections: [{ questionId: q.id, newAnswer: "attempted answer" }],
    });

    expect(result.success).toBe(true);
    const updated = db._sessionQuestions.find((sq) => sq.id === q.id);
    expect(updated?.isCorrect).toBe(false);
    expect(updated?.needsReview).toBe(true);
  });

  test("marks correctedFromPrev=true for corrected questions in round results", async () => {
    seedSession({ status: "CHECKING" });
    const q1 = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: true });
    const q2 = seedQuestion("hw-session-1", { questionNumber: 2, isCorrect: false });
    db._checkRounds.push({
      id: "round-1", homeworkSessionId: "hw-session-1", roundNumber: 1,
      score: 50, totalQuestions: 2, correctCount: 1, createdAt: new Date(),
    });
    db._homeworkSessions[0].totalRounds = 1; // Reflect the seeded round

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.submitCorrections({
      sessionId: "hw-session-1",
      corrections: [{ questionId: q2.id, newAnswer: "fix" }],
    });

    const newRound = db._checkRounds.find((r) => r.roundNumber === 2)!;
    const rr2 = db._roundQuestionResults.find(
      (rr) => rr.checkRoundId === newRound.id && rr.sessionQuestionId === q2.id
    );
    const rr1 = db._roundQuestionResults.find(
      (rr) => rr.checkRoundId === newRound.id && rr.sessionQuestionId === q1.id
    );
    expect(rr2?.correctedFromPrev).toBe(true);
    expect(rr1?.correctedFromPrev).toBe(false);
  });

  test("throws DATA_CONFLICT on optimistic lock failure", async () => {
    seedSession({ status: "CHECKING" });
    const q = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: false });
    db._checkRounds.push({
      id: "round-1", homeworkSessionId: "hw-session-1", roundNumber: 1,
      score: 0, totalQuestions: 1, correctCount: 0, createdAt: new Date(),
    });
    db._homeworkSessions[0].totalRounds = 1;

    // Simulate a concurrent write by replacing updateMany to return count=0
    const orig = db.homeworkSession.updateMany;
    db.homeworkSession.updateMany = vi.fn().mockResolvedValue({ count: 0 });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.submitCorrections({
        sessionId: "hw-session-1",
        corrections: [{ questionId: q.id, newAnswer: "x" }],
      })
    ).rejects.toThrow("DATA_CONFLICT");

    db.homeworkSession.updateMany = orig; // Restore
  });

  test("rejects session not in CHECKING status", async () => {
    seedSession({ status: "COMPLETED" });
    const q = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: false });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.submitCorrections({
        sessionId: "hw-session-1",
        corrections: [{ questionId: q.id, newAnswer: "x" }],
      })
    ).rejects.toThrow("SESSION_NOT_IN_CHECKING_STATUS");
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other", status: "CHECKING" });
    const q = seedQuestion("hw-session-1", { questionNumber: 1, isCorrect: false });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.submitCorrections({
        sessionId: "hw-session-1",
        corrections: [{ questionId: q.id, newAnswer: "x" }],
      })
    ).rejects.toThrow("FORBIDDEN");
  });
});
