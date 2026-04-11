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
import { diagnoseError } from "@/lib/domain/ai/operations/diagnose-error";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import type { SkillIPCHandlers } from "@/lib/domain/skill/types";
import type { AgentRunResult } from "@/lib/domain/agent/types";
import type { PrismaClient, Subject } from "@prisma/client";

const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

// ─── IPC Query Whitelist ─────────────────────────────

const QUERY_WHITELIST: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  searchKnowledgePoints: async (params) => {
    const keywords = params.keywords as string[];
    const subject = params.subject as string;
    const grade = params.grade as string | undefined;
    const schoolLevel = params.schoolLevel as string | undefined;
    const limit = (params.limit as number) ?? 10;

    const andConditions: Record<string, unknown>[] = [
      { deletedAt: null },
      { subject: subject as Subject },
    ];
    if (grade) andConditions.push({ grade });
    if (schoolLevel) andConditions.push({ schoolLevel });

    if (keywords.length > 0) {
      andConditions.push({
        OR: keywords.flatMap((kw) => [
          { name: { contains: kw, mode: "insensitive" as const } },
          { description: { contains: kw, mode: "insensitive" as const } },
        ]),
      });
    }

    const results = await db.knowledgePoint.findMany({
      where: { AND: andConditions },
      take: limit,
      orderBy: { depth: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        difficulty: true,
        depth: true,
        parent: { select: { name: true } },
      },
    });

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      difficulty: r.difficulty,
      depth: r.depth,
      parentName: r.parent?.name ?? null,
    }));
  },
};

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

  const logPrefix = `[diagnosis] Job ${job.id}`;

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
    console.log(
      `${logPrefix} — skipping, diagnosis already exists for errorQuestion ${errorQuestionId}`,
    );
    return;
  }

  // ── 2. KP mapping check ──
  if (!knowledgePointIds.length) {
    console.log(
      `${logPrefix} — skipping, no knowledge points mapped for question ${questionId}`,
    );
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

    const handlers: SkillIPCHandlers = {
      onCallAI: async (operation, data) => {
        switch (operation) {
          case "DIAGNOSE_ERROR": {
            const result = await diagnoseError({
              question: data.question as string,
              correctAnswer: data.correctAnswer as string,
              studentAnswer: data.studentAnswer as string,
              subject: data.subject as string,
              grade: data.grade as string | undefined,
              knowledgePoints: knowledgePoints.length > 0
                ? knowledgePoints.map((kp) => ({
                    id: kp.id,
                    name: kp.name,
                    description: kp.description ?? undefined,
                  }))
                : undefined,
              errorHistory: data.errorHistory as
                | Array<{ question: string; studentAnswer: string; knowledgePointName: string; createdAt: string }>
                | undefined,
              locale: (data.locale as string) ?? locale,
              context: aiContext,
            });
            if (!result.success) {
              throw new Error(
                result.error?.message ?? "diagnose operation failed",
              );
            }
            return result.data;
          }
          default:
            throw new Error(`Unknown AI operation: ${operation}`);
        }
      },
      onReadMemory: async (method, params) => {
        const p = params as Record<string, string>;
        switch (method) {
          case "getMasteryState":
            return memory.getMasteryState(p.studentId, p.knowledgePointId);
          case "getWeakPoints":
            return memory.getWeakPoints(p.studentId);
          default:
            throw new Error(`Unknown memory read method: ${method}`);
        }
      },
      onWriteMemory: async (method, params) => {
        const p = params as Record<string, unknown>;
        switch (method) {
          case "logIntervention":
            await memory.logIntervention(
              p.studentId as string,
              p.knowledgePointId as string,
              p.type as "DIAGNOSIS",
              { ...(p.content as Record<string, unknown>), errorQuestionId },
              { agentId: diagnosisAgent.name },
            );
            break;
          default:
            throw new Error(`Unknown memory write method: ${method}`);
        }
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
          `skills/${name}/execute.js`,
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
        } catch (error) {
          console.warn(
            `${logPrefix} — failed to ensure mastery state for KP ${weakKP.knowledgePointId}: ${error instanceof Error ? error.message : error}`,
          );
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

    console.log(
      `${logPrefix} — completed: pattern=${diagnosis?.errorPattern ?? "none"}, ${masteryUpdates} mastery updates, ${result.totalSteps} steps, ${result.totalDurationMs}ms`,
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
