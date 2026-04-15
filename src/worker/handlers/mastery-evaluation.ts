/**
 * Mastery Evaluation Agent job handler.
 *
 * Flow: (PRACTICE completion OR Brain overdue review) → Handler pre-loads
 *       context → Agent evaluates → Handler validates + writes to Memory.
 *
 * Steps:
 *   1. Idempotency — skip if a successful AgentTrace exists for this
 *      sessionId within the last hour
 *   2. Pre-load context (MasteryState, schedule, recent attempts, history,
 *      masterySpeed, currentWorkload)
 *   3. Create AgentTrace (RUNNING)
 *   4. Run AgentRunner with memoryWriteManifest=[] (Agent cannot write)
 *   5. Extract { recommendedTransition, sm2Adjustment, summary }
 *   6. Validate + apply transition (updateMasteryState) — catch
 *      InvalidTransitionError and OptimisticLockError distinctly
 *   7. Apply schedule update (scheduleReview with hybrid SM-2 if provided)
 *   8. logIntervention (REVIEW) with full suggestion payload
 *   9. Update AgentTrace (COMPLETED/FAILED)
 *  10. logAdminAction("brain-run","mastery-evaluation",...)
 *
 * See: docs/user-stories/mastery-evaluation.md (US-053)
 *      docs/PHASE3-LAUNCH-PLAN.md §四 D17, D18
 */

import type { Job } from "bullmq";
import type { MasteryEvaluationJobData } from "@/lib/infra/queue/types";
import type { PrismaClient, MasteryStatus } from "@prisma/client";
import { db } from "@/lib/infra/db";
import { AgentRunner } from "@/lib/domain/agent/runner";
import { AgentTracePublisher } from "@/lib/domain/agent/trace-publisher";
import { SkillRegistry } from "@/lib/domain/skill/registry";
import { SkillRuntime } from "@/lib/domain/skill/runtime";
import { AzureOpenAIFunctionCallingProvider } from "@/lib/domain/ai/providers/azure-openai-fc";
import { masteryEvaluationAgent } from "@/lib/domain/agent/definitions/mastery-evaluation";
import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import {
  InvalidTransitionError,
  OptimisticLockError,
} from "@/lib/domain/memory";
import { createMemoryWriteInterceptor } from "@/lib/domain/agent/memory-write-interceptor";
import { calculateHybridReview, type ErrorType } from "@/lib/domain/spaced-repetition";
import { QUERY_WHITELIST } from "./shared-query-whitelist";
import { logAdminAction } from "@/lib/domain/admin-log";
import { createLogger } from "@/lib/infra/logger";
import { withAgentSpan } from "@/lib/infra/telemetry/capture";
import type { SkillIPCHandlers } from "@/lib/domain/skill/types";
import type { AgentRunResult } from "@/lib/domain/agent/types";
import type { MasteryTransition } from "@/lib/domain/memory/types";

const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

// ─── Constants ─────────────────────────────────

const IDEMPOTENCY_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_RECENT_ATTEMPTS = 20;
const MAX_HISTORY_PRELOAD = 5;
const MAX_HISTORY_FOR_SPEED = 10;
const MASTERED_PAUSE_DAYS = 365;

// ─── Types ─────────────────────────────────────

const MASTERY_STATUS_SET = new Set<MasteryStatus>([
  "NEW_ERROR",
  "CORRECTED",
  "REVIEWING",
  "MASTERED",
  "REGRESSED",
]);

const ERROR_TYPE_SET = new Set<ErrorType>([
  "calculation",
  "concept",
  "careless",
  "method",
]);

interface ExtractedResult {
  recommendedTransition: {
    from: string;
    to: string;
    reason: string;
  } | null;
  sm2Adjustment: {
    errorType: ErrorType;
    intervalMultiplier: number;
  } | null;
  summary: string;
}

// ─── Memory Read Whitelist ─────────────────────

const MEMORY_READ_WHITELIST: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  getMasteryState: (params) =>
    memory.getMasteryState(params.studentId as string, params.knowledgePointId as string),
  getWeakPoints: (params) => memory.getWeakPoints(params.studentId as string),
  getOverdueReviews: (params) =>
    memory.getOverdueReviews(params.studentId as string),
  getInterventionHistory: (params) =>
    memory.getInterventionHistory(
      params.studentId as string,
      params.knowledgePointId as string,
    ),
};

// ─── Extract Agent Result ──────────────────────

export function extractResult(result: AgentRunResult): ExtractedResult | null {
  // Source 1: evaluate_mastery skill output (preferred)
  for (const step of result.steps) {
    if (
      step.skillName === "evaluate_mastery" &&
      step.status === "SUCCESS" &&
      step.output
    ) {
      const parsed = tryParseResult(step.output);
      if (parsed) return parsed;
    }
  }

  // Source 2: final response JSON
  if (result.finalResponse) {
    try {
      const parsed = tryParseResult(JSON.parse(result.finalResponse));
      if (parsed) return parsed;
    } catch {
      // Not valid JSON
    }
  }

  return null;
}

function tryParseResult(raw: unknown): ExtractedResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  const rawTrans = obj.recommendedTransition as Record<string, unknown> | null | undefined;
  const rawAdj = obj.sm2Adjustment as Record<string, unknown> | null | undefined;
  const summary = typeof obj.summary === "string" ? obj.summary : "";

  let transition: ExtractedResult["recommendedTransition"] = null;
  if (rawTrans && typeof rawTrans === "object") {
    const from = rawTrans.from;
    const to = rawTrans.to;
    const reason = rawTrans.reason;
    if (
      typeof from === "string" &&
      MASTERY_STATUS_SET.has(from as MasteryStatus) &&
      typeof to === "string" &&
      MASTERY_STATUS_SET.has(to as MasteryStatus) &&
      typeof reason === "string"
    ) {
      transition = { from, to, reason };
    }
  }

  let adjustment: ExtractedResult["sm2Adjustment"] = null;
  if (rawAdj && typeof rawAdj === "object") {
    const errorType = rawAdj.errorType;
    const multiplier = rawAdj.intervalMultiplier;
    if (
      typeof errorType === "string" &&
      ERROR_TYPE_SET.has(errorType as ErrorType) &&
      typeof multiplier === "number" &&
      multiplier > 0
    ) {
      adjustment = { errorType: errorType as ErrorType, intervalMultiplier: multiplier };
    }
  }

  if (!transition && !adjustment && !summary) return null;
  return { recommendedTransition: transition, sm2Adjustment: adjustment, summary };
}

// ─── Compute masterySpeed ───────────────────────

export function computeMasterySpeed(
  history: Array<{ type: string; content: unknown }>,
): number {
  const recent = history.slice(0, MAX_HISTORY_FOR_SPEED);
  if (recent.length === 0) return 0.5; // neutral default

  let correct = 0;
  let total = 0;
  for (const h of recent) {
    const content = (h.content as { isCorrect?: boolean }) ?? {};
    if (typeof content.isCorrect !== "boolean") continue;
    total += 1;
    if (content.isCorrect) correct += 1;
  }
  return total > 0 ? correct / total : 0.5;
}

// ─── Handler ───────────────────────────────────

export async function handleMasteryEvaluation(
  job: Job<MasteryEvaluationJobData>,
): Promise<void> {
  const { studentId, knowledgePointId, reviewScheduleId, userId, locale } =
    job.data;

  // sessionId must be unique per (student, kp, schedule). reviewScheduleId
  // already encodes that triple (ReviewSchedule has @@unique([studentId,
  // knowledgePointId])), so it alone is sufficient as the idempotency key.
  // We avoid concatenating all three IDs because cuids are 25 chars each and
  // AgentTrace.sessionId is VarChar(64) — a naive `slice(0, 64)` truncates
  // the trailing reviewScheduleId entirely, causing distinct schedules to
  // collide on the same sessionId and silently skip valid evaluations.
  const sessionId = `me-${reviewScheduleId}`;
  const log = createLogger("worker:mastery-evaluation").child({
    jobId: job.id,
    correlationId: `me-${studentId}-${job.id}`,
    studentId,
    knowledgePointId,
  });

  // ── 1. Idempotency: recent successful trace? ──
  const recentSuccess = await db.agentTrace.findFirst({
    where: {
      agentName: masteryEvaluationAgent.name,
      sessionId,
      status: "COMPLETED",
      createdAt: { gte: new Date(Date.now() - IDEMPOTENCY_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recentSuccess) {
    log.info({ sessionId }, "Skipping: recent successful evaluation exists");
    return;
  }

  // ── 2. Pre-load context ──
  const mastery = await memory.getMasteryState(studentId, knowledgePointId);
  if (!mastery) {
    log.info("Skipping: MasteryState not found (may be archived)");
    return;
  }

  const schedule = await db.reviewSchedule.findUnique({
    where: {
      studentId_knowledgePointId: { studentId, knowledgePointId },
    },
  });
  if (!schedule) {
    log.warn(
      { reviewScheduleId },
      "Skipping: ReviewSchedule missing (unexpected — should have been created upstream)",
    );
    return;
  }

  const history = await memory.getInterventionHistory(studentId, knowledgePointId);
  const preloadedHistory = history.slice(0, MAX_HISTORY_PRELOAD);
  const masterySpeed = computeMasterySpeed(history);

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentTasks = await db.dailyTask.findMany({
    where: {
      knowledgePointId,
      status: "COMPLETED",
      completedAt: { gte: sevenDaysAgo },
      pack: { studentId },
    },
    orderBy: { completedAt: "desc" },
    take: MAX_RECENT_ATTEMPTS,
    select: {
      type: true,
      completedAt: true,
      content: true,
    },
  });

  // EXPLANATION tasks have no correctness semantic (student just marks as
  // viewed), so emit `isCorrect: null` for them to avoid mis-weighting them
  // as errors in the Agent's input signal. REVIEW/PRACTICE tasks carry
  // isCorrect in content when submitted via daily-task router.
  const recentAttempts = recentTasks.map((t) => {
    const content = (t.content as { isCorrect?: boolean } | null) ?? {};
    const isCorrect: boolean | null =
      t.type === "EXPLANATION"
        ? null
        : typeof content.isCorrect === "boolean"
          ? content.isCorrect
          : null;
    return {
      taskType: t.type as string,
      isCorrect,
      completedAt: (t.completedAt ?? new Date()).toISOString(),
      content: t.content ?? undefined,
    };
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentWorkload = await db.dailyTask.count({
    where: {
      status: "PENDING",
      pack: { studentId, date: today },
    },
  });

  // Load KP name for Agent context
  const kp = await db.knowledgePoint.findUnique({
    where: { id: knowledgePointId },
    select: { name: true },
  });
  const kpName = kp?.name ?? knowledgePointId;

  // Load student grade
  const student = await db.user.findUnique({
    where: { id: studentId },
    select: { grade: true },
  });
  const grade = student?.grade ?? undefined;

  // ── 3. Create AgentTrace (wrapped in OTEL span so pipeline child spans inherit) ──
  await withAgentSpan(
    masteryEvaluationAgent.name,
    { studentId, userId, sessionId },
    async (otelTraceId) => {
  const trace = await db.agentTrace.create({
    data: {
      agentName: masteryEvaluationAgent.name,
      sessionId,
      userId,
      status: "RUNNING",
      otelTraceId, // Sprint 15: 供 Jaeger 深链
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
      correlationId: `me-${studentId}-${job.id}`,
    };

    const onWriteMemory = createMemoryWriteInterceptor(
      {
        agentName: masteryEvaluationAgent.name,
        manifest: masteryEvaluationAgent.memoryWriteManifest,
        db: db as unknown as PrismaClient,
        userId,
      },
      async () => {
        // Should never be called — manifest is [] so every call is rejected
        // by the interceptor before reaching here. Exists as a defensive no-op.
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

    // ── 5. Build user message ──
    const attemptsList =
      recentAttempts.length > 0
        ? recentAttempts
            .map((a) => {
              const outcome =
                a.isCorrect === null
                  ? "viewed"
                  : a.isCorrect
                    ? "CORRECT"
                    : "INCORRECT";
              return `- ${a.completedAt} [${a.taskType}] ${outcome}`;
            })
            .join("\n")
        : "(no recent attempts in the last 7 days)";

    const historyList =
      preloadedHistory.length > 0
        ? preloadedHistory
            .map((h) => `- ${h.createdAt.toISOString()} [${h.type}]`)
            .join("\n")
        : "(no prior interventions)";

    const userMessage = `Knowledge point: ${kpName} [${knowledgePointId}]
Current MasteryState: ${mastery.status}
Review schedule: intervalDays=${schedule.intervalDays}, easeFactor=${schedule.easeFactor.toFixed(2)}, consecutiveCorrect=${schedule.consecutiveCorrect}
masterySpeed: ${masterySpeed.toFixed(2)}
currentWorkload: ${currentWorkload}

Recent attempts (most recent first):
${attemptsList}

Recent intervention history (most recent 5):
${historyList}

Call evaluate_mastery with the context above, then produce your final JSON.`;

    // ── 6. Run the agent ──
    const runResult = await runner.run(
      {
        ...masteryEvaluationAgent,
        systemPrompt: masteryEvaluationAgent.systemPrompt.replace(
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
        correlationId: `me-${studentId}-${job.id}`,
      },
    );

    // ── 7. Persist trace steps ──
    for (const step of runResult.steps) {
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

    // ── 8. Extract suggestion ──
    const extracted = extractResult(runResult);
    let transitionApplied: MasteryTransition | null = null;
    let transitionRejected: string | null = null;
    let scheduleUpdated = false;
    let hybridInterval: number | null = null;

    if (extracted) {
      // ── 9a. Apply transition (if any) ──
      if (extracted.recommendedTransition) {
        const proposed: MasteryTransition = {
          from: extracted.recommendedTransition.from as MasteryStatus,
          to: extracted.recommendedTransition.to as MasteryStatus,
          reason: extracted.recommendedTransition.reason,
        };

        try {
          await memory.updateMasteryState(studentId, knowledgePointId, proposed);
          transitionApplied = proposed;
        } catch (err) {
          if (err instanceof InvalidTransitionError) {
            transitionRejected = "state-drift";
            log.warn(
              { proposed, currentStatus: mastery.status },
              "Transition rejected: state drift",
            );
          } else if (err instanceof OptimisticLockError) {
            // Let the job fail so BullMQ retries
            log.warn({ proposed }, "Transition rejected: optimistic lock conflict");
            throw err;
          } else {
            throw err;
          }
        }
      }

      // Effective final status for schedule decision
      const effectiveStatus: MasteryStatus = transitionApplied
        ? transitionApplied.to
        : (mastery.status as MasteryStatus);

      // ── 9b. Apply schedule update ──
      if (effectiveStatus === "MASTERED" && transitionApplied) {
        // Pause reviews by scheduling far into the future
        await memory.scheduleReview(studentId, knowledgePointId, MASTERED_PAUSE_DAYS, {
          easeFactor: schedule.easeFactor,
          consecutiveCorrect: schedule.consecutiveCorrect,
        });
        scheduleUpdated = true;
        hybridInterval = MASTERED_PAUSE_DAYS;
      } else if (effectiveStatus === "REVIEWING" && extracted.sm2Adjustment) {
        const hybrid = calculateHybridReview({
          sm2Base: {
            interval: schedule.intervalDays,
            easeFactor: schedule.easeFactor,
            repetition: schedule.consecutiveCorrect,
          },
          errorType: extracted.sm2Adjustment.errorType,
          masterySpeed,
          currentWorkload,
        });
        await memory.scheduleReview(
          studentId,
          knowledgePointId,
          hybrid.interval,
          {
            easeFactor: hybrid.easeFactor,
            consecutiveCorrect: hybrid.repetition,
          },
        );
        scheduleUpdated = true;
        hybridInterval = hybrid.interval;
      }

      // ── 9c. Log intervention (audit trail) ──
      await memory.logIntervention(
        studentId,
        knowledgePointId,
        "REVIEW",
        {
          agentReasoning: extracted.summary,
          transition: transitionApplied
            ? `${transitionApplied.from}->${transitionApplied.to}`
            : null,
          transitionRejected,
          sm2Adjustment: extracted.sm2Adjustment,
          hybridInterval,
        },
        { agentId: masteryEvaluationAgent.name },
      );
    }

    // ── 10. Update AgentTrace ──
    const traceStatus = runResult.status as "COMPLETED" | "TERMINATED" | "FAILED";
    const summary = extracted
      ? transitionApplied
        ? `Applied ${transitionApplied.from}->${transitionApplied.to}${scheduleUpdated ? " + schedule update" : ""}`
        : scheduleUpdated
          ? `Schedule adjusted (${hybridInterval}d), no transition`
          : transitionRejected
            ? `Transition rejected (${transitionRejected})`
            : "No change needed"
      : "Agent produced no actionable output";

    await db.agentTrace.update({
      where: { id: trace.id },
      data: {
        status: traceStatus,
        totalSteps: runResult.totalSteps,
        totalInputTokens: runResult.totalTokens.inputTokens,
        totalOutputTokens: runResult.totalTokens.outputTokens,
        totalDurationMs: runResult.totalDurationMs,
        terminationReason: runResult.terminationReason,
        summary,
        completedAt: new Date(),
      },
    });

    await tracePublisher.publishTraceCompleted(
      traceStatus,
      runResult.terminationReason,
      runResult.totalSteps,
      runResult.totalDurationMs,
      summary,
    );

    // AdminLog per Rule 9
    await logAdminAction(
      db as unknown as PrismaClient,
      userId,
      "brain-run",
      masteryEvaluationAgent.name,
      {
        studentId,
        knowledgePointId,
        reviewScheduleId,
        transition: transitionApplied
          ? `${transitionApplied.from}->${transitionApplied.to}`
          : null,
        transitionRejected,
        sm2Adjusted: !!extracted?.sm2Adjustment,
        hybridInterval,
        masterySpeed,
        currentWorkload,
        totalSteps: runResult.totalSteps,
        durationMs: runResult.totalDurationMs,
      },
    ).catch((err) => log.warn({ err }, "Failed to log admin action"));

    log.info(
      {
        transition: transitionApplied
          ? `${transitionApplied.from}->${transitionApplied.to}`
          : null,
        transitionRejected,
        scheduleUpdated,
        hybridInterval,
        totalSteps: runResult.totalSteps,
      },
      "Mastery evaluation completed",
    );
  } catch (error) {
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
    },
  );
}
