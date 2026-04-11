/**
 * Tests: Question Understanding Agent Handler (Task 56)
 *
 * Verifies:
 *   - Idempotency: skips if mappings already exist
 *   - KG empty: gracefully skips when no knowledge points
 *   - Mapping extraction from classify skill output
 *   - Mapping extraction from agent final response (JSON)
 *   - AgentTrace creation and completion
 *   - Invalid KP IDs filtered out
 *
 * Uses mocked Prisma + mocked AgentRunner (no real AI calls).
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// ─── Mock modules ────────────────────────────────
// vi.mock factories are hoisted — use vi.hoisted for shared state

const { mockDb, mockRunResult, mockPublishJobResult } = vi.hoisted(() => ({
  mockDb: {
    questionKnowledgeMapping: {
      count: vi.fn(),
      createMany: vi.fn(),
    },
    knowledgePoint: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    agentTrace: {
      create: vi.fn(),
      update: vi.fn(),
    },
    agentTraceStep: {
      create: vi.fn(),
    },
  },
  mockRunResult: vi.fn(),
  mockPublishJobResult: vi.fn(),
}));

vi.mock("@/lib/infra/db", () => ({ db: mockDb }));

vi.mock("@/lib/domain/agent/runner", () => ({
  AgentRunner: vi.fn().mockImplementation(() => ({ run: mockRunResult })),
}));

vi.mock("@/lib/domain/ai/providers/azure-openai-fc", () => ({
  AzureOpenAIFunctionCallingProvider: vi.fn(),
}));

vi.mock("@/lib/domain/skill/registry", () => ({
  SkillRegistry: vi.fn(),
}));

vi.mock("@/lib/domain/skill/runtime", () => ({
  SkillRuntime: vi.fn(),
}));

vi.mock("@/lib/infra/events", () => ({
  publishJobResult: mockPublishJobResult,
  sessionChannel: (id: string) => `job:result:session:${id}`,
}));

vi.mock("@/lib/domain/agent/trace-publisher", () => ({
  AgentTracePublisher: vi.fn().mockImplementation(() => ({
    publishStepStarted: vi.fn().mockResolvedValue(undefined),
    publishStepCompleted: vi.fn().mockResolvedValue(undefined),
    publishTraceCompleted: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@/lib/domain/ai/operations/classify-question-knowledge", () => ({
  classifyQuestionKnowledge: vi.fn(),
}));

import { handleQuestionUnderstanding } from "@/worker/handlers/question-understanding";
import type { Job } from "bullmq";
import type { QuestionUnderstandingJobData } from "@/lib/infra/queue/types";
import type { AgentRunResult } from "@/lib/domain/agent/types";

// ─── Fixtures ────────────────────────────────────

function createMockJob(
  overrides?: Partial<QuestionUnderstandingJobData>,
): Job<QuestionUnderstandingJobData> {
  return {
    id: "test-job-1",
    data: {
      sessionId: "session-1",
      questionId: "question-1",
      questionText: "What is 3 + 5?",
      subject: "MATH",
      grade: "PRIMARY_3",
      schoolLevel: "PRIMARY",
      studentId: "student-1",
      userId: "user-1",
      locale: "zh-CN",
      ...overrides,
    },
    attemptsMade: 0,
    opts: { attempts: 3 },
  } as unknown as Job<QuestionUnderstandingJobData>;
}

function createAgentResult(
  overrides?: Partial<AgentRunResult>,
): AgentRunResult {
  return {
    agentName: "question-understanding",
    status: "COMPLETED",
    terminationReason: "COMPLETED",
    steps: [
      {
        stepNo: 1,
        skillName: "search_knowledge_points",
        input: { keywords: ["addition"], subject: "MATH" },
        output: {
          results: [
            { id: "kp-1", name: "Addition", description: "Basic addition" },
            { id: "kp-2", name: "Subtraction", description: "Basic subtraction" },
          ],
        },
        durationMs: 50,
        tokensUsed: { inputTokens: 100, outputTokens: 50 },
        status: "SUCCESS",
      },
      {
        stepNo: 2,
        skillName: "classify_question_knowledge",
        input: {
          questionText: "What is 3 + 5?",
          questionSubject: "MATH",
          candidates: [
            { id: "kp-1", name: "Addition" },
            { id: "kp-2", name: "Subtraction" },
          ],
        },
        output: {
          mappings: [
            { knowledgePointId: "kp-1", confidence: 0.95, reasoning: "Direct addition problem" },
            { knowledgePointId: "kp-2", confidence: 0.3, reasoning: "Not subtraction" },
          ],
        },
        durationMs: 200,
        tokensUsed: { inputTokens: 300, outputTokens: 100 },
        status: "SUCCESS",
      },
    ],
    totalSteps: 2,
    totalTokens: { inputTokens: 400, outputTokens: 150 },
    totalDurationMs: 250,
    finalResponse: '{"mappings": [{"knowledgePointId": "kp-1", "confidence": 0.95}]}',
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────

describe("Question Understanding Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults
    mockDb.questionKnowledgeMapping.count.mockResolvedValue(0);
    mockDb.knowledgePoint.count.mockResolvedValue(50);
    mockDb.agentTrace.create.mockResolvedValue({ id: "trace-1" });
    mockDb.agentTrace.update.mockResolvedValue({});
    mockDb.agentTraceStep.create.mockResolvedValue({});
    mockDb.knowledgePoint.findMany.mockResolvedValue([{ id: "kp-1" }]);
    mockDb.questionKnowledgeMapping.createMany.mockResolvedValue({ count: 1 });
    mockRunResult.mockResolvedValue(createAgentResult());
  });

  // ── Idempotency ──────────────────────────────

  test("skips when mappings already exist for question", async () => {
    mockDb.questionKnowledgeMapping.count.mockResolvedValue(3);

    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    // Should not create trace or run agent
    expect(mockDb.agentTrace.create).not.toHaveBeenCalled();
    expect(mockRunResult).not.toHaveBeenCalled();
  });

  // ── KG Empty ──────────────────────────────────

  test("skips gracefully when no knowledge points exist for subject", async () => {
    mockDb.knowledgePoint.count.mockResolvedValue(0);

    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    // Should publish skip event, not create trace
    expect(mockDb.agentTrace.create).not.toHaveBeenCalled();
    expect(mockPublishJobResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: "question-understanding",
        status: "completed",
        data: expect.objectContaining({ skipped: true, reason: "empty_kg" }),
      }),
    );
  });

  // ── Successful Mapping ────────────────────────

  test("extracts mappings from classify skill output and writes to DB", async () => {
    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    // Should create trace
    expect(mockDb.agentTrace.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          agentName: "question-understanding",
          status: "RUNNING",
        }),
      }),
    );

    // Should write mappings (only kp-1 with confidence >= 0.5)
    expect(mockDb.questionKnowledgeMapping.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            questionId: "question-1",
            knowledgePointId: "kp-1",
            mappingSource: "AI_DETECTED",
            confidence: 0.95,
          }),
        ],
      }),
    );

    // Should update trace to COMPLETED
    expect(mockDb.agentTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "trace-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          terminationReason: "COMPLETED",
        }),
      }),
    );

    // Should publish success event
    expect(mockPublishJobResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        type: "question-understanding",
        status: "completed",
        data: expect.objectContaining({ mappings: 1 }),
      }),
    );
  });

  // ── Invalid KP ID Filtering ───────────────────

  test("filters out mappings with non-existent knowledge point IDs", async () => {
    // Agent returns mappings for kp-1 and kp-3, but only kp-1 exists in DB
    mockRunResult.mockResolvedValue(
      createAgentResult({
        steps: [
          {
            stepNo: 1,
            skillName: "classify_question_knowledge",
            input: {},
            output: {
              mappings: [
                { knowledgePointId: "kp-1", confidence: 0.9, reasoning: "Valid" },
                { knowledgePointId: "kp-3", confidence: 0.8, reasoning: "Hallucinated" },
              ],
            },
            durationMs: 100,
            tokensUsed: { inputTokens: 200, outputTokens: 80 },
            status: "SUCCESS" as const,
          },
        ],
      }),
    );

    // kp-3 does not exist
    mockDb.knowledgePoint.findMany.mockResolvedValue([{ id: "kp-1" }]);

    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    // Should only write kp-1, not kp-3
    expect(mockDb.questionKnowledgeMapping.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({ knowledgePointId: "kp-1" }),
        ],
      }),
    );
  });

  // ── JSON Fallback Extraction ──────────────────

  test("extracts mappings from final response JSON when no classify step output", async () => {
    mockRunResult.mockResolvedValue(
      createAgentResult({
        steps: [
          {
            stepNo: 1,
            skillName: "search_knowledge_points",
            input: { keywords: ["addition"] },
            output: { results: [{ id: "kp-1", name: "Addition" }] },
            durationMs: 50,
            tokensUsed: { inputTokens: 100, outputTokens: 50 },
            status: "SUCCESS" as const,
          },
        ],
        finalResponse: JSON.stringify({
          mappings: [
            { knowledgePointId: "kp-1", confidence: 0.85 },
          ],
        }),
      }),
    );

    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    expect(mockDb.questionKnowledgeMapping.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            knowledgePointId: "kp-1",
            confidence: 0.85,
          }),
        ],
      }),
    );
  });

  // ── Empty Mapping Result ──────────────────────

  test("handles no matching knowledge points gracefully", async () => {
    mockRunResult.mockResolvedValue(
      createAgentResult({
        steps: [],
        finalResponse: '{"mappings": []}',
      }),
    );

    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    // Should not attempt to write empty mappings
    expect(mockDb.questionKnowledgeMapping.createMany).not.toHaveBeenCalled();

    // Should still complete trace
    expect(mockDb.agentTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  // ── Agent Failure ─────────────────────────────

  test("records FAILED trace when agent throws", async () => {
    mockRunResult.mockRejectedValue(new Error("AI provider timeout"));
    // The error handler calls agentTrace.update which returns a promise, then .catch
    mockDb.agentTrace.update.mockResolvedValue({});
    mockPublishJobResult.mockResolvedValue(undefined);

    const job = createMockJob();

    await expect(handleQuestionUnderstanding(job)).rejects.toThrow(
      "AI provider timeout",
    );

    // Should update trace to FAILED
    expect(mockDb.agentTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          terminationReason: "ERROR",
        }),
      }),
    );
  });

  // ── Trace Steps Recorded ──────────────────────

  test("records each agent step in AgentTraceStep", async () => {
    const job = createMockJob();
    await handleQuestionUnderstanding(job);

    // The fixture has 2 steps
    expect(mockDb.agentTraceStep.create).toHaveBeenCalledTimes(2);
    expect(mockDb.agentTraceStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          traceId: "trace-1",
          stepNo: 1,
          skillName: "search_knowledge_points",
          status: "SUCCESS",
        }),
      }),
    );
    expect(mockDb.agentTraceStep.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          traceId: "trace-1",
          stepNo: 2,
          skillName: "classify_question_knowledge",
          status: "SUCCESS",
        }),
      }),
    );
  });
});
