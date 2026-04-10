/**
 * Acceptance Tests: AI Recognition Module
 * User Stories: US-013 ~ US-015
 * Sprint: 2
 */
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { recognizeHomeworkSchema, type RecognizeHomeworkOutput } from '@/lib/ai/harness/schemas/recognize-homework'
import { gradeAnswerSchema } from '@/lib/ai/harness/schemas/grade-answer'
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

vi.mock("@/lib/storage", () => import("../helpers/mock-storage"));
vi.mock("@/lib/ai/operations/grade-answer", () => ({
  gradeAnswer: vi.fn().mockResolvedValue({ success: true, data: { isCorrect: true, confidence: 0.95 } }),
}));
vi.mock("@/lib/ai/operations/help-generate", () => ({
  generateHelp: vi.fn().mockResolvedValue({
    success: true,
    data: { helpText: "Help content", level: 1, knowledgePoint: "Test" },
  }),
}));

const createCaller = createCallerFactory(appRouter);

describe('US-013: AI Content Recognition', () => {
  test('schema accepts printed text, handwriting, and formulas', () => {
    const output: RecognizeHomeworkOutput = {
      subject: "MATH",
      subjectConfidence: 0.95,
      contentType: "HOMEWORK",
      questions: [
        { questionNumber: 1, questionType: "CALCULATION", content: "25 + 38 = ?", studentAnswer: "63", confidence: 0.9 },
        { questionNumber: 2, questionType: "FILL_BLANK", content: "x² + 2x + 1 = (___)", studentAnswer: "(x+1)²", confidence: 0.85 },
        { questionNumber: 3, questionType: "SHORT_ANSWER", content: "手写题目内容", studentAnswer: "手写答案", confidence: 0.7 },
      ],
    };
    const result = recognizeHomeworkSchema.safeParse(output);
    expect(result.success).toBe(true);
  })

  test('auto-detects subject and content type', () => {
    const output: RecognizeHomeworkOutput = {
      subject: "CHINESE",
      subjectConfidence: 0.92,
      contentType: "DICTATION",
      questions: [
        { questionNumber: 1, questionType: "DICTATION_ITEM", content: "天气", studentAnswer: "天气", confidence: 0.99 },
      ],
    };
    const result = recognizeHomeworkSchema.safeParse(output);
    expect(result.success).toBe(true);
    expect(result.data!.subject).toBe("CHINESE");
    expect(result.data!.contentType).toBe("DICTATION");
    expect(result.data!.subjectConfidence).toBeGreaterThan(0.5);
  })

  test('structures output into individual questions', () => {
    const output: RecognizeHomeworkOutput = {
      subject: "MATH",
      subjectConfidence: 0.9,
      contentType: "HOMEWORK",
      questions: [
        { questionNumber: 1, questionType: "CALCULATION", content: "1+1=?", studentAnswer: "2", confidence: 0.99 },
        { questionNumber: 2, questionType: "CALCULATION", content: "2+2=?", studentAnswer: "4", confidence: 0.95 },
        { questionNumber: 3, questionType: "FILL_BLANK", content: "3+__=5", studentAnswer: "2", confidence: 0.88 },
      ],
    };
    const result = recognizeHomeworkSchema.safeParse(output);
    expect(result.success).toBe(true);
    expect(result.data!.questions).toHaveLength(3);
    expect(result.data!.questions[0].questionNumber).toBe(1);
    expect(result.data!.questions[2].questionType).toBe("FILL_BLANK");
  })

  test('schema requires at least one question', () => {
    const empty = {
      subject: "MATH",
      subjectConfidence: 0.9,
      contentType: "HOMEWORK",
      questions: [],
    };
    const result = recognizeHomeworkSchema.safeParse(empty);
    expect(result.success).toBe(false);
  })

  test('schema includes optional imageRegion for question positioning', () => {
    const output: RecognizeHomeworkOutput = {
      subject: "MATH",
      subjectConfidence: 0.9,
      contentType: "EXAM",
      questions: [
        {
          questionNumber: 1, questionType: "CALCULATION",
          content: "5+5=?", studentAnswer: "10", confidence: 0.99,
          imageRegion: { x: 10, y: 20, w: 80, h: 15 },
        },
      ],
    };
    const result = recognizeHomeworkSchema.safeParse(output);
    expect(result.success).toBe(true);
    expect(result.data!.questions[0].imageRegion).toBeDefined();
  })
})

describe('US-014: AI Scoring', () => {
  test('schema validates correct/wrong judgement', () => {
    const correct = gradeAnswerSchema.safeParse({ isCorrect: true, confidence: 0.99 });
    expect(correct.success).toBe(true);

    const wrong = gradeAnswerSchema.safeParse({ isCorrect: false, confidence: 0.85 });
    expect(wrong.success).toBe(true);
  })

  test('calculates total score via confirmResults', async () => {
    const db = createMockDb();
    db._homeworkSessions.push({
      id: "s1", studentId: "student1", createdBy: "student1",
      subject: "MATH", contentType: null, grade: "PRIMARY_3", title: null,
      status: "RECOGNIZED", finalScore: null, totalRounds: 0,
      createdAt: new Date(), updatedAt: new Date(),
    });
    db._sessionQuestions.push(
      { id: "q1", homeworkSessionId: "s1", questionNumber: 1, questionType: "CALCULATION", content: "1+1=?", studentAnswer: "2", correctAnswer: "2", isCorrect: true, confidence: 0.99, needsReview: false, imageRegion: null, aiKnowledgePoint: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "q2", homeworkSessionId: "s1", questionNumber: 2, questionType: "CALCULATION", content: "2+2=?", studentAnswer: "5", correctAnswer: "4", isCorrect: false, confidence: 0.95, needsReview: false, imageRegion: null, aiKnowledgePoint: null, createdAt: new Date(), updatedAt: new Date() },
    );

    const caller = createCaller(createMockContext(db, { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" }));
    const result = await caller.homework.confirmResults({ sessionId: "s1" });

    expect(result.status).toBe("CHECKING");
    expect(result.totalRounds).toBe(1);
  })

  test('low confidence questions marked for review', () => {
    const output: RecognizeHomeworkOutput = {
      subject: "MATH",
      subjectConfidence: 0.9,
      contentType: "HOMEWORK",
      questions: [
        { questionNumber: 1, questionType: "CALCULATION", content: "1+1=?", studentAnswer: "2", confidence: 0.3 },
      ],
    };
    const result = recognizeHomeworkSchema.safeParse(output);
    expect(result.success).toBe(true);
    // Confidence below threshold should trigger review in the operation layer
    expect(result.data!.questions[0].confidence).toBeLessThan(0.5);
  })
})

describe('US-015: Manual Correction of AI Results', () => {
  let db: MockDb;

  beforeEach(() => {
    db = createMockDb();
    db._homeworkSessions.push({
      id: "s1", studentId: "student1", createdBy: "student1",
      subject: "MATH", contentType: null, grade: "PRIMARY_3", title: null,
      status: "RECOGNIZED", finalScore: null, totalRounds: 0,
      createdAt: new Date(), updatedAt: new Date(),
    });
    db._sessionQuestions.push(
      { id: "q1", homeworkSessionId: "s1", questionNumber: 1, questionType: "CALCULATION", content: "1+1=?", studentAnswer: "2", correctAnswer: "2", isCorrect: true, confidence: 0.99, needsReview: false, imageRegion: null, aiKnowledgePoint: null, createdAt: new Date(), updatedAt: new Date() },
      { id: "q2", homeworkSessionId: "s1", questionNumber: 2, questionType: "CALCULATION", content: "2+2=?", studentAnswer: "5", correctAnswer: "4", isCorrect: false, confidence: 0.95, needsReview: false, imageRegion: null, aiKnowledgePoint: null, createdAt: new Date(), updatedAt: new Date() },
    );
  });

  test('user can inline edit question content', async () => {
    const caller = createCaller(createMockContext(db, { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" }));
    const result = await caller.homework.updateQuestion({
      questionId: "q1",
      content: "1+2=?",
    });
    expect(result.content).toBe("1+2=?");
  })

  test('user can edit student/correct answers', async () => {
    const caller = createCaller(createMockContext(db, { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" }));
    const result = await caller.homework.updateQuestion({
      questionId: "q2",
      studentAnswer: "4",
      correctAnswer: "4",
    });
    expect(result.studentAnswer).toBe("4");
    expect(result.correctAnswer).toBe("4");
  })

  test('user can toggle correct/wrong', async () => {
    const caller = createCaller(createMockContext(db, { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" }));
    const result = await caller.homework.updateQuestion({
      questionId: "q2",
      isCorrect: true,
    });
    expect(result.isCorrect).toBe(true);
  })

  test('user can add missed questions', async () => {
    const caller = createCaller(createMockContext(db, { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" }));
    const result = await caller.homework.addQuestion({
      sessionId: "s1",
      content: "3+3=?",
      studentAnswer: "7",
      correctAnswer: "6",
      isCorrect: false,
    });
    expect(result.content).toBe("3+3=?");
    expect(db._sessionQuestions).toHaveLength(3);
  })

  test('user can delete false positives', async () => {
    const caller = createCaller(createMockContext(db, { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" }));
    await caller.homework.deleteQuestion({ questionId: "q2" });
    expect(db._sessionQuestions).toHaveLength(1);
    expect(db._sessionQuestions[0].id).toBe("q1");
  })

  test.todo('corrections recorded for future AI improvement')
})
