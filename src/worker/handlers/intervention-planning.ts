/**
 * Intervention Planning Agent job handler.
 *
 * Flow: Brain triggers → Handler pre-loads weakness data →
 *       Agent generates task plan → Handler writes DailyTaskPack/DailyTask.
 *
 * Steps:
 *   1. Idempotency check — skip if DailyTaskPack already exists for today
 *   2. Pre-load weakness data (WeaknessProfile + MasteryState + KP details)
 *   3. Load ParentStudentConfig.maxDailyTasks
 *   4. Create AgentTrace (RUNNING)
 *   5. Run AgentRunner (search_knowledge_points + generate_daily_tasks)
 *   6. Extract task plan → validate KP IDs → clamp to maxDailyTasks
 *   7. Write DailyTaskPack + DailyTask[] in transaction (D17)
 *   8. Update AgentTrace (COMPLETED/FAILED)
 *
 * See: docs/user-stories/intervention-daily-tasks.md (US-049)
 */

import type { Job } from "bullmq";
import type { InterventionPlanningJobData } from "@/lib/infra/queue/types";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/infra/db";
import { AgentRunner } from "@/lib/domain/agent/runner";
import { AgentTracePublisher } from "@/lib/domain/agent/trace-publisher";
import { SkillRegistry } from "@/lib/domain/skill/registry";
import { SkillRuntime } from "@/lib/domain/skill/runtime";
import { AzureOpenAIFunctionCallingProvider } from "@/lib/domain/ai/providers/azure-openai-fc";
import { interventionPlanningAgent } from "@/lib/domain/agent/definitions/intervention-planning";
import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import { createMemoryWriteInterceptor } from "@/lib/domain/agent/memory-write-interceptor";
import { isWithinLearningHours } from "@/lib/domain/parent/is-within-learning-hours";
import { QUERY_WHITELIST } from "./shared-query-whitelist";
import { logAdminAction } from "@/lib/domain/admin-log";
import { createLogger } from "@/lib/infra/logger";
import type { SkillIPCHandlers } from "@/lib/domain/skill/types";
import type { AgentRunResult } from "@/lib/domain/agent/types";
import type { InterventionKind } from "@/lib/domain/memory/types";

const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

// ─── Memory Read Whitelist ──────────────────────────────

const MEMORY_READ_WHITELIST: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  getMasteryState: (params) =>
    memory.getMasteryState(params.studentId as string, params.knowledgePointId as string),
  getWeakPoints: (params) =>
    memory.getWeakPoints(params.studentId as string),
  getOverdueReviews: (params) =>
    memory.getOverdueReviews(params.studentId as string),
  getInterventionHistory: (params) =>
    memory.getInterventionHistory(
      params.studentId as string,
      params.knowledgePointId as string,
    ),
};

// ─── Task Plan Extraction ──────────────────────────────

interface ExtractedTask {
  type: "REVIEW" | "PRACTICE" | "EXPLANATION";
  knowledgePointId: string;
  questionId?: string;
  content?: Record<string, unknown>;
  sortOrder: number;
}

interface ExtractedTaskPlan {
  tasks: ExtractedTask[];
  reasoning?: string;
}

function extractTaskPlan(result: AgentRunResult): ExtractedTaskPlan | null {
  // Source 1: generate_daily_tasks skill output
  for (const step of result.steps) {
    if (
      step.skillName === "generate_daily_tasks" &&
      step.status === "SUCCESS" &&
      step.output
    ) {
      const output = step.output as Record<string, unknown>;
      if (output.tasks && Array.isArray(output.tasks)) {
        return {
          tasks: output.tasks as ExtractedTask[],
          reasoning: output.reasoning as string | undefined,
        };
      }
    }
  }

  // Source 2: final response JSON
  if (result.finalResponse) {
    try {
      const parsed = JSON.parse(result.finalResponse) as {
        taskPlan?: { tasks?: ExtractedTask[]; reasoning?: string };
      };
      if (parsed.taskPlan?.tasks?.length) {
        return { tasks: parsed.taskPlan.tasks, reasoning: parsed.taskPlan.reasoning };
      }
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

// ─── Handler ─────────────────────────────────────────

export async function handleInterventionPlanning(
  job: Job<InterventionPlanningJobData>,
): Promise<void> {
  const { studentId, knowledgePointIds, userId, locale } = job.data;

  const log = createLogger("worker:intervention-planning").child({
    jobId: job.id,
    correlationId: `ip-${studentId}-${job.id}`,
    studentId,
  });

  // ── 1. Idempotency: skip if DailyTaskPack exists for today ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const existingPack = await db.dailyTaskPack.findUnique({
    where: { studentId_date: { studentId, date: today } },
  });
  if (existingPack) {
    log.info("Skipping, DailyTaskPack already exists for today");
    return;
  }

  // ── 2. Pre-load weakness data (optimization: Agent doesn't call weakness_profile) ──
  const weaknessProfile = await memory.getWeaknessProfile(studentId, "PERIODIC");
  const allWeakPoints = await memory.getWeakPoints(studentId);
  const overdueReviews = await memory.getOverdueReviews(studentId);
  const overdueKPIds = new Set(overdueReviews.map((r) => r.knowledgePointId));

  // Merge: KP IDs from Brain dispatch + profile worsening KPs + realtime weak points
  const targetKPIds = new Set(knowledgePointIds);

  // Build weak point entries from MasteryState
  interface WeakPointEntry {
    kpId: string;
    severity: "HIGH" | "MEDIUM" | "LOW";
    trend: "IMPROVING" | "STABLE" | "WORSENING";
    errorCount: number;
  }

  const weakPointMap = new Map<string, WeakPointEntry>();

  // From realtime MasteryState
  for (const wp of allWeakPoints) {
    if (!targetKPIds.has(wp.knowledgePointId)) continue;
    const errorCount = wp.totalAttempts - wp.correctAttempts;
    const correctRate = wp.totalAttempts > 0 ? wp.correctAttempts / wp.totalAttempts : 0;
    const severity: "HIGH" | "MEDIUM" | "LOW" =
      errorCount >= 5 || correctRate < 0.3 ? "HIGH" : errorCount >= 3 ? "MEDIUM" : "LOW";

    weakPointMap.set(wp.knowledgePointId, {
      kpId: wp.knowledgePointId,
      severity,
      trend: "STABLE", // will be overridden by profile if available
      errorCount,
    });
  }

  // Enrich with WeaknessProfile trend data
  if (weaknessProfile?.data?.weakPoints) {
    for (const wp of weaknessProfile.data.weakPoints) {
      const existing = weakPointMap.get(wp.kpId);
      if (existing) {
        existing.trend = wp.trend;
        // Use profile severity if higher
        const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        if (sevOrder[wp.severity] < sevOrder[existing.severity]) {
          existing.severity = wp.severity;
        }
      } else if (targetKPIds.has(wp.kpId)) {
        weakPointMap.set(wp.kpId, {
          kpId: wp.kpId,
          severity: wp.severity,
          trend: wp.trend,
          errorCount: wp.errorCount,
        });
      }
    }
  }

  const weakPointEntries = [...weakPointMap.values()];
  if (weakPointEntries.length === 0) {
    log.info("No weak points to plan for, skipping");
    return;
  }

  // Load KP details (names)
  const kpDetails = await db.knowledgePoint.findMany({
    where: { id: { in: [...targetKPIds] }, deletedAt: null },
    select: { id: true, name: true, subject: true },
  });
  const kpNameMap = new Map(kpDetails.map((kp) => [kp.id, kp.name]));

  // Build enriched weak points with names
  const weakPointsWithNames = weakPointEntries.map((wp) => ({
    ...wp,
    kpName: kpNameMap.get(wp.kpId) ?? wp.kpId,
  }));

  // ── 3. Load ParentStudentConfig.maxDailyTasks + learning-hours window ──
  const config = await db.parentStudentConfig.findFirst({
    where: { studentId },
    select: {
      maxDailyTasks: true,
      learningTimeStart: true,
      learningTimeEnd: true,
    },
  });
  const maxDailyTasks = config?.maxDailyTasks ?? 10;

  if (maxDailyTasks <= 0) {
    log.info({ maxDailyTasks }, "maxDailyTasks is 0, skipping task generation");
    return;
  }

  // Parent-configured learning hours (US-054): when both bounds are set,
  // skip task generation outside the allowed window. Overnight windows
  // (e.g. 22:00-07:00) are supported via isWithinLearningHours.
  const now = new Date();
  if (
    !isWithinLearningHours(now, {
      start: config?.learningTimeStart ?? null,
      end: config?.learningTimeEnd ?? null,
    })
  ) {
    log.info(
      {
        now: now.toISOString(),
        start: config?.learningTimeStart,
        end: config?.learningTimeEnd,
      },
      "skip: outside parent-configured learning hours",
    );
    return;
  }

  // Load student grade
  const student = await db.user.findUnique({
    where: { id: studentId },
    select: { grade: true },
  });
  const grade = student?.grade ?? undefined;

  // ── 4. Create AgentTrace ──
  const trace = await db.agentTrace.create({
    data: {
      agentName: interventionPlanningAgent.name,
      sessionId: `brain-${studentId}-${today.toISOString().split("T")[0]}`,
      userId,
      status: "RUNNING",
    },
  });

  const tracePublisher = new AgentTracePublisher(trace.id);

  try {
    // ── 5. Set up AgentRunner ──
    const provider = new AzureOpenAIFunctionCallingProvider();
    const registry = new SkillRegistry(db);

    const aiContext = {
      userId,
      locale,
      grade,
      correlationId: `ip-${studentId}-${job.id}`,
    };

    const onWriteMemory = createMemoryWriteInterceptor(
      {
        agentName: interventionPlanningAgent.name,
        manifest: interventionPlanningAgent.memoryWriteManifest,
        db: db as unknown as PrismaClient,
        userId,
      },
      async (method, params) => {
        if (method === "logIntervention") {
          await memory.logIntervention(
            params.studentId as string,
            params.knowledgePointId as string,
            ((params.type as string) || "REVIEW") as InterventionKind,
            {
              ...(params.content as Record<string, unknown>),
            },
            { agentId: interventionPlanningAgent.name },
          );
        } else {
          throw new Error(`Unhandled memory write method: ${method}`);
        }
      },
    );

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
        const name = skill.functionSchema.name.replace(/_/g, "-");
        return require("path").resolve(
          process.cwd(),
          `skills/${name}/index.js`,
        );
      },
    });

    // ── 6. Build user message with pre-loaded weakness data ──
    const weakPointsList = weakPointsWithNames
      .map(
        (wp) =>
          `- ${wp.kpName} [${wp.kpId}]: severity=${wp.severity}, trend=${wp.trend}, errors=${wp.errorCount}${overdueKPIds.has(wp.kpId) ? ", OVERDUE REVIEW" : ""}`,
      )
      .join("\n");

    const overdueList = weakPointsWithNames
      .filter((wp) => overdueKPIds.has(wp.kpId))
      .map((wp) => wp.kpName);

    const userMessage = `Generate a daily task plan for this student (grade: ${grade ?? "unknown"}).

Weak knowledge points:
${weakPointsList}
${overdueList.length > 0 ? `\nKnowledge points with OVERDUE reviews (prefer REVIEW tasks for these): ${overdueList.join(", ")}` : ""}
Maximum daily tasks: ${maxDailyTasks}

Prioritize HIGH severity and WORSENING trend knowledge points. For OVERDUE REVIEW KPs, prefer assigning REVIEW tasks if error questions exist.`;

    // ── 7. Run the agent ──
    const result = await runner.run(
      {
        ...interventionPlanningAgent,
        systemPrompt: interventionPlanningAgent.systemPrompt.replace(
          "{{locale}}",
          locale,
        ),
      },
      userMessage,
      {
        userId,
        studentId,
        sessionId: trace.sessionId!,
        traceId: trace.id,
        locale,
        grade,
        correlationId: `ip-${studentId}-${job.id}`,
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

    // ── 9. Extract task plan and write to DB (D17: handler writes) ──
    const taskPlan = extractTaskPlan(result);
    let tasksWritten = 0;

    if (taskPlan && taskPlan.tasks.length > 0) {
      // Validate KP IDs exist
      const validKPIds = new Set(
        (
          await db.knowledgePoint.findMany({
            where: {
              id: { in: taskPlan.tasks.map((t) => t.knowledgePointId) },
              deletedAt: null,
            },
            select: { id: true },
          })
        ).map((kp) => kp.id),
      );

      const VALID_TYPES = new Set(["REVIEW", "PRACTICE", "EXPLANATION"]);
      const validTasks = taskPlan.tasks
        .filter(
          (t) =>
            validKPIds.has(t.knowledgePointId) &&
            VALID_TYPES.has(t.type) &&
            typeof t.sortOrder === "number",
        )
        .slice(0, maxDailyTasks);

      if (validTasks.length > 0) {
        await db.$transaction(async (tx) => {
          const pack = await tx.dailyTaskPack.create({
            data: {
              studentId,
              date: today,
              status: "PENDING",
              totalTasks: validTasks.length,
              completedTasks: 0,
            },
          });

          for (const task of validTasks) {
            await tx.dailyTask.create({
              data: {
                packId: pack.id,
                type: task.type,
                knowledgePointId: task.knowledgePointId,
                questionId: task.questionId ?? null,
                content: task.content ?? undefined,
                status: "PENDING",
                sortOrder: task.sortOrder,
              },
            });
          }

          tasksWritten = validTasks.length;
        });
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
        summary: tasksWritten > 0
          ? `Generated ${tasksWritten} daily tasks for ${weakPointEntries.length} weak KPs.`
          : "No tasks could be generated from agent result.",
        completedAt: new Date(),
      },
    });

    await tracePublisher.publishTraceCompleted(
      traceStatus,
      result.terminationReason,
      result.totalSteps,
      result.totalDurationMs,
      tasksWritten > 0
        ? `${tasksWritten} tasks generated`
        : undefined,
    );

    // AdminLog per Rule 8
    await logAdminAction(
      db as unknown as PrismaClient,
      userId,
      "brain-run",
      interventionPlanningAgent.name,
      {
        studentId,
        weakPointsCount: weakPointEntries.length,
        tasksWritten,
        totalSteps: result.totalSteps,
        durationMs: result.totalDurationMs,
      },
    ).catch((err) => log.warn({ err }, "Failed to log admin action"));

    log.info(
      {
        tasksWritten,
        weakPoints: weakPointEntries.length,
        totalSteps: result.totalSteps,
        durationMs: result.totalDurationMs,
      },
      "Intervention planning completed",
    );
  } catch (error) {
    // ── Error: update trace ──
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

    throw error;
  }
}
