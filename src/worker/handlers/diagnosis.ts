/**
 * Diagnosis Agent job handler.
 *
 * Flow: QUA completed → Agent diagnoses error pattern → creates MasteryState
 *
 * Steps:
 *   1. Idempotency check — skip if diagnosis already exists for this errorQuestion
 *   2. KP mapping check — skip if no knowledge points mapped
 *   3. Query error history (last 30 days, same KPs)
 *   4. Create AgentTrace (RUNNING)
 *   5. Run AgentRunner (diagnose_error + search_knowledge_points)
 *   6. Extract diagnosis → create/update MasteryState via Memory layer
 *   7. Update AgentTrace (COMPLETED/FAILED)
 *   8. Publish SSE event
 *
 * See: docs/user-stories/diagnosis-mastery.md (US-035)
 */

import type { Job } from "bullmq";
import type { DiagnosisJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { AgentRunner } from "@/lib/domain/agent/runner";
import { AgentTracePublisher } from "@/lib/domain/agent/trace-publisher";
import { SkillRegistry } from "@/lib/domain/skill/registry";
import { SkillRuntime } from "@/lib/domain/skill/runtime";
import { AzureOpenAIFunctionCallingProvider } from "@/lib/domain/ai/providers/azure-openai-fc";
import { diagnosisAgent } from "@/lib/domain/agent/definitions/diagnosis";
import { publishJobResult, sessionChannel } from "@/lib/infra/events";
import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import { QUERY_WHITELIST } from "./shared-query-whitelist";
import { createLogger } from "@/lib/infra/logger";
import type { SkillIPCHandlers } from "@/lib/domain/skill/types";
import type { AgentRunResult } from "@/lib/domain/agent/types";
import type { PrismaClient } from "@prisma/client";

const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

// ─── Memory Read/Write Whitelists ────────────────────────

function buildMemoryWhitelists(memory: StudentMemoryImpl) {
  const MEMORY_READ_WHITELIST: Record<
    string,
    (params: Record<string, unknown>) => Promise<unknown>
  > = {
    getMasteryState: (params) =>
      memory.getMasteryState(params.studentId as string, params.knowledgePointId as string),
    getWeakPoints: (params) =>
      memory.getWeakPoints(params.studentId as string),
  };

  const MEMORY_WRITE_WHITELIST: Record<
    string,
    (params: Record<string, unknown>, extra: { errorQuestionId: string; agentName: string }) => Promise<void>
  > = {
    logIntervention: async (params, extra) => {
      await memory.logIntervention(
        params.studentId as string,
        params.knowledgePointId as string,
        params.type as "DIAGNOSIS",
        { ...(params.content as Record<string, unknown>), errorQuestionId: extra.errorQuestionId },
        { agentId: extra.agentName },
      );
    },
  };

  return { MEMORY_READ_WHITELIST, MEMORY_WRITE_WHITELIST };
}

// ─── Diagnosis Extraction ──────────────────────────────

interface ExtractedDiagnosis {
  errorPattern: string;
  weakKnowledgePoints: Array<{
    knowledgePointId: string;
    severity: string;
    reasoning: string;
  }>;
  recommendation: string;
}

/**
 * Extract diagnosis from agent run result.
 * Looks at diagnose_error skill outputs first, then final response.
 */
function extractDiagnosis(result: AgentRunResult): ExtractedDiagnosis | null {
  // Source 1: diagnose_error skill output
  for (const step of result.steps) {
    if (
      step.skillName === "diagnose_error" &&
      step.status === "SUCCESS" &&
      step.output
    ) {
      const output = step.output as Record<string, unknown>;
      if (output.errorPattern) {
        return {
          errorPattern: output.errorPattern as string,
          weakKnowledgePoints: (output.weakKnowledgePoints as ExtractedDiagnosis["weakKnowledgePoints"]) ?? [],
          recommendation: (output.recommendation as string) ?? "",
        };
      }
    }
  }

  // Source 2: final response JSON
  if (result.finalResponse) {
    try {
      const parsed = JSON.parse(result.finalResponse) as {
        diagnosis?: ExtractedDiagnosis;
      };
      if (parsed.diagnosis?.errorPattern) {
        return parsed.diagnosis;
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

// ─── Handler ─────────────────────────────────────────

export async function handleDiagnosis(
  job: Job<DiagnosisJobData>,
): Promise<void> {
  const {
    sessionId,
    questionId,
    errorQuestionId,
    questionText,
    correctAnswer,
    studentAnswer,
    subject,
    grade,
    knowledgePointIds,
    studentId,
    userId,
    locale,
  } = job.data;

  const log = createLogger("worker:diagnosis").child({
    jobId: job.id,
    correlationId: `diag-${sessionId}-${errorQuestionId}`,
    sessionId,
  });

  // ── 1. Idempotency: skip if diagnosis already exists ──
  const existingDiagnosis = await db.interventionHistory.count({
    where: {
      studentId,
      type: "DIAGNOSIS",
      content: {
        path: ["errorQuestionId"],
        equals: errorQuestionId,
      },
    },
  });
  if (existingDiagnosis > 0) {
    log.info({ errorQuestionId }, "Skipping, diagnosis already exists");
    return;
  }

  // ── 2. KP mapping check ──
  if (!knowledgePointIds.length) {
    log.info({ questionId }, "Skipping, no knowledge points mapped");
    await publishJobResult(sessionChannel(sessionId), {
      type: "diagnosis",
      status: "completed",
      data: { questionId, skipped: true, reason: "no_knowledge_mappings" },
    });
    return;
  }

  // ── 3. Query error history (last 30 days, same KPs) ──
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const errorHistory = await db.errorQuestion.findMany({
    where: {
      deletedAt: null,
      studentId,
      createdAt: { gte: thirtyDaysAgo },
      knowledgeMappings: {
        some: { knowledgePointId: { in: knowledgePointIds } },
      },
      id: { not: errorQuestionId }, // Exclude current question
    },
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      content: true,
      studentAnswer: true,
      createdAt: true,
      knowledgeMappings: {
        select: {
          knowledgePoint: { select: { name: true } },
        },
        take: 1,
      },
    },
  });

  const errorHistoryForAgent = errorHistory.map((eq) => ({
    question: eq.content ?? "",
    studentAnswer: eq.studentAnswer ?? "",
    knowledgePointName: eq.knowledgeMappings[0]?.knowledgePoint.name ?? "",
    createdAt: eq.createdAt.toISOString().split("T")[0],
  }));

  // ── 4. Load knowledge point details ──
  const knowledgePoints = await db.knowledgePoint.findMany({
    where: { id: { in: knowledgePointIds }, deletedAt: null },
    select: { id: true, name: true, description: true },
  });

  // ── 5. Create AgentTrace ──
  const trace = await db.agentTrace.create({
    data: {
      agentName: diagnosisAgent.name,
      sessionId,
      userId,
      status: "RUNNING",
    },
  });

  const tracePublisher = new AgentTracePublisher(trace.id);

  try {
    // ── 6. Set up AgentRunner ──
    const provider = new AzureOpenAIFunctionCallingProvider();
    const registry = new SkillRegistry(db);

    const aiContext = {
      userId,
      locale,
      grade,
      correlationId: `diag-${sessionId}-${errorQuestionId}`,
    };

    const { MEMORY_READ_WHITELIST, MEMORY_WRITE_WHITELIST } = buildMemoryWhitelists(memory);

    const handlers: SkillIPCHandlers = {
      onCallAI: async (operation, data) => {
        const result = await callAIOperation(operation, data, aiContext);
        if (!result.success) {
          throw new Error(result.error?.message ?? `${operation} operation failed`);
        }
        return result.data;
      },
      onReadMemory: async (method, params) => {
        const readFn = MEMORY_READ_WHITELIST[method];
        if (!readFn) {
          throw new Error(`Unknown memory read method: ${method}`);
        }
        return readFn(params);
      },
      onWriteMemory: async (method, params) => {
        const writeFn = MEMORY_WRITE_WHITELIST[method];
        if (!writeFn) {
          throw new Error(`Unknown memory write method: ${method}`);
        }
        await writeFn(params, { errorQuestionId, agentName: diagnosisAgent.name });
      },
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
        const name = skill.functionSchema.name.replace(/_/g, "-");
        return require("path").resolve(
          process.cwd(),
          `skills/${name}/index.js`,
        );
      },
    });

    // ── 7. Run the agent ──
    const userMessage = `Diagnose this ${subject} error (grade: ${grade ?? "unknown"}):

Question: "${questionText}"
Correct answer: "${correctAnswer}"
Student's answer: "${studentAnswer}"

Knowledge points mapped to this question: ${knowledgePoints.map((kp) => `${kp.name} (${kp.id})`).join(", ")}

${errorHistoryForAgent.length > 0 ? `Error history (last 30 days):\n${errorHistoryForAgent.map((h) => `- "${h.question}" → "${h.studentAnswer}" (KP: ${h.knowledgePointName})`).join("\n")}` : "No prior error history for these knowledge points."}`;

    const result = await runner.run(
      {
        ...diagnosisAgent,
        systemPrompt: diagnosisAgent.systemPrompt.replace(
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
        correlationId: `diag-${sessionId}-${errorQuestionId}`,
      },
    );

    // ── 8. Record agent steps in trace ──
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

    // ── 9. Extract diagnosis and create MasteryState ──
    const diagnosis = extractDiagnosis(result);
    let masteryUpdates = 0;

    if (diagnosis?.weakKnowledgePoints.length) {
      // Validate KP IDs exist
      const validKpIds = new Set(
        (
          await db.knowledgePoint.findMany({
            where: {
              id: {
                in: diagnosis.weakKnowledgePoints.map((w) => w.knowledgePointId),
              },
              deletedAt: null,
            },
            select: { id: true },
          })
        ).map((kp) => kp.id),
      );

      for (const weakKP of diagnosis.weakKnowledgePoints) {
        if (!validKpIds.has(weakKP.knowledgePointId)) continue;

        try {
          await memory.ensureMasteryState(studentId, weakKP.knowledgePointId);
          masteryUpdates++;

          // Write diagnosis result to InterventionHistory (US-035 audit trail)
          await memory.logIntervention(
            studentId,
            weakKP.knowledgePointId,
            "DIAGNOSIS",
            {
              errorPattern: diagnosis.errorPattern,
              errorQuestionId,
              severity: weakKP.severity,
              reasoning: weakKP.reasoning,
            },
            { agentId: diagnosisAgent.name },
          );
        } catch (error) {
          log.warn({ knowledgePointId: weakKP.knowledgePointId, err: error }, "Failed to ensure mastery state");
        }
      }
    }

    // ── 10. Update AgentTrace ──
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
        summary: diagnosis
          ? `Error pattern: ${diagnosis.errorPattern}. ${diagnosis.weakKnowledgePoints.length} weak KP(s) identified. ${masteryUpdates} mastery state(s) updated.`
          : "No diagnosis could be extracted from agent result.",
        completedAt: new Date(),
      },
    });

    await tracePublisher.publishTraceCompleted(
      traceStatus,
      result.terminationReason,
      result.totalSteps,
      result.totalDurationMs,
      diagnosis
        ? `Diagnosed ${diagnosis.errorPattern}, ${masteryUpdates} mastery updates.`
        : undefined,
    );

    // ── 11. Publish SSE event ──
    await publishJobResult(sessionChannel(sessionId), {
      type: "diagnosis",
      status: "completed",
      data: {
        questionId,
        errorQuestionId,
        errorPattern: diagnosis?.errorPattern,
        weakKnowledgePoints: diagnosis?.weakKnowledgePoints.length ?? 0,
        masteryUpdates,
        traceId: trace.id,
      },
    });

    log.info(
      { errorPattern: diagnosis?.errorPattern, masteryUpdates, totalSteps: result.totalSteps, durationMs: result.totalDurationMs },
      "Diagnosis completed",
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

    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      await publishJobResult(sessionChannel(sessionId), {
        type: "diagnosis",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
    }

    throw error;
  }
}
