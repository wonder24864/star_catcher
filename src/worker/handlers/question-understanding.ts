/**
 * Question Understanding Agent job handler.
 *
 * Flow: CheckSession COMPLETED → Agent analyzes question → maps to knowledge points
 *
 * Steps:
 *   1. Idempotency check — skip if mappings already exist for this question
 *   2. KG empty check — gracefully skip if no knowledge points in DB
 *   3. Create AgentTrace (RUNNING)
 *   4. Run AgentRunner (search KPs → classify relevance)
 *   5. Extract mappings from agent result → write to QuestionKnowledgeMapping
 *   6. Update AgentTrace (COMPLETED/FAILED)
 *   7. Publish SSE event
 *
 * See: docs/user-stories/question-understanding.md (US-033)
 */

import type { Job } from "bullmq";
import type { QuestionUnderstandingJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { AgentRunner } from "@/lib/domain/agent/runner";
import { AgentTracePublisher } from "@/lib/domain/agent/trace-publisher";
import { SkillRegistry } from "@/lib/domain/skill/registry";
import { SkillRuntime } from "@/lib/domain/skill/runtime";
import { AzureOpenAIFunctionCallingProvider } from "@/lib/domain/ai/providers/azure-openai-fc";
import { questionUnderstandingAgent } from "@/lib/domain/agent/definitions/question-understanding";
import { publishJobResult, sessionChannel } from "@/lib/infra/events";
import { enqueueDiagnosis } from "@/lib/infra/queue";
import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import { createMemoryWriteInterceptor } from "@/lib/domain/agent/memory-write-interceptor";
import { QUERY_WHITELIST } from "./shared-query-whitelist";
import { createLogger } from "@/lib/infra/logger";
import { captureOtelTraceId } from "@/lib/infra/telemetry/capture";
import type { SkillIPCHandlers } from "@/lib/domain/skill/types";
import type { AgentRunResult } from "@/lib/domain/agent/types";
import type { PrismaClient } from "@prisma/client";
import type { Subject } from "@prisma/client";

// ─── Mapping Extraction ──────────────────────────────

interface ExtractedMapping {
  knowledgePointId: string;
  confidence: number;
}

/**
 * Extract knowledge point mappings from agent run result.
 * Looks at:
 *   1. classify_question_knowledge skill outputs (structured)
 *   2. Agent's final response (JSON fallback)
 */
function extractMappings(result: AgentRunResult): ExtractedMapping[] {
  const mappings: ExtractedMapping[] = [];
  const seen = new Set<string>();

  // Source 1: classify skill outputs
  for (const step of result.steps) {
    if (
      step.skillName === "classify_question_knowledge" &&
      step.status === "SUCCESS" &&
      step.output
    ) {
      const output = step.output as {
        mappings?: Array<{ knowledgePointId: string; confidence: number }>;
      };
      if (output.mappings) {
        for (const m of output.mappings) {
          if (m.confidence >= 0.5 && !seen.has(m.knowledgePointId)) {
            seen.add(m.knowledgePointId);
            mappings.push({
              knowledgePointId: m.knowledgePointId,
              confidence: m.confidence,
            });
          }
        }
      }
    }
  }

  // Source 2: final response JSON (if no mappings found from skills)
  if (mappings.length === 0 && result.finalResponse) {
    try {
      const parsed = JSON.parse(result.finalResponse) as {
        mappings?: Array<{ knowledgePointId: string; confidence: number }>;
      };
      if (parsed.mappings) {
        for (const m of parsed.mappings) {
          if (m.confidence >= 0.5 && !seen.has(m.knowledgePointId)) {
            seen.add(m.knowledgePointId);
            mappings.push({
              knowledgePointId: m.knowledgePointId,
              confidence: m.confidence,
            });
          }
        }
      }
    } catch {
      // Not valid JSON — that's OK, mappings remain empty
    }
  }

  return mappings;
}

// ─── Handler ─────────────────────────────────────────

export async function handleQuestionUnderstanding(
  job: Job<QuestionUnderstandingJobData>,
): Promise<void> {
  const {
    sessionId,
    questionId,
    questionText,
    subject,
    grade,
    schoolLevel,
    studentId,
    userId,
    locale,
  } = job.data;

  const log = createLogger("worker:question-understanding").child({
    jobId: job.id,
    correlationId: `qu-${sessionId}-${questionId}`,
    sessionId,
  });

  // ── 1. Idempotency: skip if mappings already exist ──
  const existingCount = await db.questionKnowledgeMapping.count({
    where: { questionId },
  });
  if (existingCount > 0) {
    log.info({ questionId, existingCount }, "Skipping, mappings already exist");
    return;
  }

  // ── 2. KG empty check ──
  const kpCount = await db.knowledgePoint.count({
    where: { deletedAt: null, subject: subject as Subject },
  });
  if (kpCount === 0) {
    log.info({ subject }, "Skipping, no knowledge points for subject");
    await publishJobResult(sessionChannel(sessionId), {
      type: "question-understanding",
      status: "completed",
      data: { questionId, mappings: 0, skipped: true, reason: "empty_kg" },
    });
    return;
  }

  // ── 3. Create AgentTrace ──
  const trace = await db.agentTrace.create({
    data: {
      agentName: questionUnderstandingAgent.name,
      sessionId,
      userId,
      status: "RUNNING",
      otelTraceId: captureOtelTraceId(), // Sprint 15: 供 Jaeger 深链
    },
  });

  const tracePublisher = new AgentTracePublisher(trace.id);

  try {
    // ── 4. Set up AgentRunner ──
    const provider = new AzureOpenAIFunctionCallingProvider();
    const registry = new SkillRegistry(db);

    const aiContext = {
      userId,
      locale,
      grade,
      correlationId: `qu-${sessionId}-${questionId}`,
    };

    const onWriteMemory = createMemoryWriteInterceptor(
      {
        agentName: questionUnderstandingAgent.name,
        manifest: questionUnderstandingAgent.memoryWriteManifest,
        db: db as unknown as PrismaClient,
        userId,
      },
      async () => {},
    );

    const handlers: SkillIPCHandlers = {
      onCallAI: async (operation, data) => {
        const result = await callAIOperation(operation, data, aiContext);
        if (!result.success) {
          throw new Error(result.error?.message ?? `${operation} operation failed`);
        }
        return result.data;
      },
      onReadMemory: async () => null,
      onWriteMemory,
      onQuery: async (queryName, data) => {
        const queryFn = QUERY_WHITELIST[queryName];
        if (!queryFn) {
          throw new Error(`Query "${queryName}" is not whitelisted`);
        }
        return queryFn(data);
      },
    };

    const runtime = new SkillRuntime(handlers);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: (skill) => {
        // Skills are stored in skills/<name>/index.js at project root
        const name = skill.functionSchema.name.replace(/_/g, "-");
        return require("path").resolve(
          process.cwd(),
          `skills/${name}/index.js`,
        );
      },
    });

    // ── 5. Run the agent ──
    const userMessage = `Analyze this ${subject} question (grade: ${grade ?? "unknown"}, schoolLevel: ${schoolLevel}):

"${questionText}"

Find the relevant knowledge points and classify their relevance.`;

    const result = await runner.run(
      {
        ...questionUnderstandingAgent,
        systemPrompt: questionUnderstandingAgent.systemPrompt.replace(
          "{{locale}}",
          locale,
        ),
      },
      userMessage,
      {
        userId,
        studentId,
        sessionId,
        traceId: trace.id,
        locale,
        grade,
        correlationId: `qu-${sessionId}-${questionId}`,
      },
    );

    // ── 6. Record agent steps in trace ──
    for (const step of result.steps) {
      await db.agentTraceStep.create({
        data: {
          traceId: trace.id,
          stepNo: step.stepNo,
          skillName: step.skillName,
          input: step.input as Record<string, unknown>,
          output: (step.output as Record<string, unknown>) ?? undefined,
          inputTokens: step.tokensUsed.inputTokens,
          outputTokens: step.tokensUsed.outputTokens,
          durationMs: step.durationMs,
          status: step.status,
          errorMessage: step.errorMessage,
        },
      });

      await tracePublisher.publishStepCompleted(
        step.stepNo,
        step.skillName,
        step.status,
        step.durationMs,
        step.errorMessage,
      );
    }

    // ── 7. Extract mappings and write to DB ──
    const mappings = extractMappings(result);

    // Validate that knowledge point IDs actually exist
    const validKpIds = new Set(
      (
        await db.knowledgePoint.findMany({
          where: {
            id: { in: mappings.map((m) => m.knowledgePointId) },
            deletedAt: null,
          },
          select: { id: true },
        })
      ).map((kp) => kp.id),
    );

    const validMappings = mappings.filter((m) =>
      validKpIds.has(m.knowledgePointId),
    );

    if (validMappings.length > 0) {
      await db.questionKnowledgeMapping.createMany({
        data: validMappings.map((m) => ({
          questionId,
          knowledgePointId: m.knowledgePointId,
          mappingSource: "AI_DETECTED" as const,
          confidence: m.confidence,
        })),
        skipDuplicates: true,
      });
    }

    // ── 8. Update AgentTrace ──
    const traceStatus = result.status as "COMPLETED" | "TERMINATED" | "FAILED";
    await db.agentTrace.update({
      where: { id: trace.id },
      data: {
        status: traceStatus,
        totalSteps: result.totalSteps,
        totalInputTokens: result.totalTokens.inputTokens,
        totalOutputTokens: result.totalTokens.outputTokens,
        totalDurationMs: result.totalDurationMs,
        terminationReason: result.terminationReason,
        summary: `Mapped ${validMappings.length} knowledge points for question.`,
        completedAt: new Date(),
      },
    });

    await tracePublisher.publishTraceCompleted(
      traceStatus,
      result.terminationReason,
      result.totalSteps,
      result.totalDurationMs,
      `Mapped ${validMappings.length} knowledge points.`,
    );

    // ── 9. Publish SSE event ──
    await publishJobResult(sessionChannel(sessionId), {
      type: "question-understanding",
      status: "completed",
      data: {
        questionId,
        mappings: validMappings.length,
        traceId: trace.id,
      },
    });

    // ── 10. Chain-trigger Diagnosis Agent ──
    if (validMappings.length > 0) {
      try {
        // Look up the ErrorQuestion for this SessionQuestion
        const errorQuestion = await db.errorQuestion.findFirst({
          where: {
            sessionQuestionId: questionId,
            deletedAt: null,
          },
          select: {
            id: true,
            content: true,
            studentAnswer: true,
            correctAnswer: true,
          },
        });

        if (errorQuestion) {
          await enqueueDiagnosis({
            sessionId,
            questionId,
            errorQuestionId: errorQuestion.id,
            questionText: questionText,
            correctAnswer: errorQuestion.correctAnswer ?? "",
            studentAnswer: errorQuestion.studentAnswer ?? "",
            subject,
            grade,
            knowledgePointIds: validMappings.map((m) => m.knowledgePointId),
            studentId,
            userId,
            locale,
          });
          log.info({ errorQuestionId: errorQuestion.id }, "Enqueued diagnosis");
        }
      } catch (chainError) {
        // Don't fail QUA if diagnosis enqueue fails
        log.warn({ err: chainError }, "Failed to enqueue diagnosis");
      }
    }

    log.info(
      { mappings: validMappings.length, totalSteps: result.totalSteps, durationMs: result.totalDurationMs },
      "Question understanding completed",
    );
  } catch (error) {
    // ── Error: update trace + publish failure ──
    await db.agentTrace
      .update({
        where: { id: trace.id },
        data: {
          status: "FAILED",
          terminationReason: "ERROR",
          summary:
            error instanceof Error ? error.message : "Unknown error",
          completedAt: new Date(),
        },
      })
      .catch(() => {});

    await tracePublisher
      .publishTraceCompleted("FAILED", "ERROR", 0, 0)
      .catch(() => {});

    // Publish failure on last attempt
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      await publishJobResult(sessionChannel(sessionId), {
        type: "question-understanding",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
    }

    throw error;
  }
}
