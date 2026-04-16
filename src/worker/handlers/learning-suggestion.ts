/**
 * Learning Suggestion BullMQ job handler.
 *
 * Two modes:
 *   1. studentId === "__all__" → Fan out: query active students,
 *      enqueue individual learning-suggestion jobs.
 *   2. Specific studentId → Load weakness/mastery data,
 *      call LEARNING_SUGGESTION AI operation, save result.
 *
 * Follows the weakness-profile handler pattern (direct Harness call,
 * no AgentRunner) — single-step AI invocation with DB persistence.
 *
 * See: US-061 (parent-analytics-phase4.md)
 */

import type { Job } from "bullmq";
import type { LearningSuggestionJobData } from "@/lib/infra/queue/types";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/infra/db";
import { enqueueLearningSuggestion } from "@/lib/infra/queue";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import { logAdminAction } from "@/lib/domain/admin-log";
import { createLogger } from "@/lib/infra/logger";
import { withAgentSpan } from "@/lib/infra/telemetry/capture";
import { getActiveStudentIds } from "./shared-active-students";

const log = createLogger("worker:learning-suggestion");

// ─── Week Start Computation ──────────────────────

/** Get Monday 00:00 of the current week (UTC). */
function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // Adjust to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// ─── Handler ────────────────────────────────────

export async function handleLearningSuggestion(
  job: Job<LearningSuggestionJobData>,
): Promise<void> {
  const { studentId, userId, locale, type: suggestionType } = job.data;
  const resolvedType = suggestionType ?? "WEEKLY_AUTO";

  const jobLog = log.child({ jobId: job.id, studentId, type: resolvedType });

  // ── Mode 1: Fan out to individual students ──
  if (studentId === "__all__") {
    const studentIds = await getActiveStudentIds();
    jobLog.info(
      { count: studentIds.length },
      "Learning-suggestion fanout: enqueuing individual jobs",
    );

    for (const sid of studentIds) {
      await enqueueLearningSuggestion({
        studentId: sid,
        userId,
        locale,
        type: resolvedType,
      });
    }
    return;
  }

  // ── Mode 2: Generate suggestion for one student ──
  const startTime = Date.now();
  const memory = new StudentMemoryImpl(db as unknown as PrismaClient);
  const weekStart = getWeekStart();

  // Idempotency: for WEEKLY_AUTO, skip if already exists this week.
  // ON_DEMAND always regenerates (upsert will overwrite).
  if (resolvedType === "WEEKLY_AUTO") {
    const existing = await db.learningSuggestion.findUnique({
      where: {
        studentId_weekStart_type: { studentId, weekStart, type: resolvedType },
      },
    });
    if (existing) {
      jobLog.info("Skipping, WEEKLY_AUTO already exists for this week");
      return;
    }
  }

  // 1. Load weak points
  const weakPoints = await memory.getWeakPoints(studentId);
  if (weakPoints.length === 0) {
    jobLog.info("No weak points, skipping suggestion generation");
    return;
  }

  // 2. Load KP details (names)
  const kpIds = weakPoints.map((wp) => wp.knowledgePointId);
  const kpDetails = await db.knowledgePoint.findMany({
    where: { id: { in: kpIds }, deletedAt: null },
    select: { id: true, name: true, subject: true },
  });
  const kpNameMap = new Map(kpDetails.map((kp) => [kp.id, kp.name]));

  // 3. Build enriched weak points
  const enrichedWeakPoints = weakPoints.map((wp) => {
    const errorCount = wp.totalAttempts - wp.correctAttempts;
    const correctRate =
      wp.totalAttempts > 0 ? wp.correctAttempts / wp.totalAttempts : 0;
    const severity =
      errorCount >= 5 || correctRate < 0.3
        ? "HIGH"
        : errorCount >= 3
          ? "MEDIUM"
          : "LOW";

    return {
      kpId: wp.knowledgePointId,
      kpName: kpNameMap.get(wp.knowledgePointId) ?? wp.knowledgePointId,
      severity,
      trend: "STABLE",
      errorCount,
    };
  });

  // 4. Build mastery states
  const masteryStates = weakPoints.map((wp) => ({
    kpId: wp.knowledgePointId,
    kpName: kpNameMap.get(wp.knowledgePointId) ?? wp.knowledgePointId,
    status: wp.status,
    correctRate:
      wp.totalAttempts > 0 ? wp.correctAttempts / wp.totalAttempts : 0,
  }));

  // 5. Load recent intervention history (latest 5 per KP, cap at 10 KPs)
  const allInterventions: Array<{
    kpName: string;
    type: string;
    createdAt: string;
    preMasteryStatus: string | null;
  }> = [];

  for (const kpId of kpIds.slice(0, 10)) {
    const history = await memory.getInterventionHistory(studentId, kpId);
    for (const h of history.slice(0, 5)) {
      allInterventions.push({
        kpName: kpNameMap.get(kpId) ?? kpId,
        type: h.type,
        createdAt: h.createdAt.toISOString(),
        preMasteryStatus: h.preMasteryStatus ?? null,
      });
    }
  }

  // 6. Load student grade
  const student = await db.user.findUnique({
    where: { id: studentId },
    select: { grade: true },
  });

  // 7. Call AI operation (wrapped in OTEL span)
  await withAgentSpan(
    "learning-suggestion",
    { studentId, userId, jobId: job.id ?? "" },
    async () => {
      const aiContext = {
        userId,
        locale,
        grade: student?.grade ?? undefined,
        correlationId: `ls-${studentId}-${job.id}`,
      };

      const result = await callAIOperation(
        "LEARNING_SUGGESTION",
        {
          weakPoints: enrichedWeakPoints,
          masteryStates,
          interventionHistory: allInterventions,
          grade: student?.grade ?? undefined,
          locale,
        },
        aiContext,
      );

      if (!result.success) {
        throw new Error(result.error?.message ?? "LEARNING_SUGGESTION operation failed");
      }

      // 8. Persist to DB (upsert by studentId + weekStart + type)
      await db.learningSuggestion.upsert({
        where: {
          studentId_weekStart_type: { studentId, weekStart, type: resolvedType },
        },
        create: {
          studentId,
          type: resolvedType,
          content: result.data as never,
          weekStart,
        },
        update: {
          content: result.data as never,
          createdAt: new Date(),
        },
      });

      const durationMs = Date.now() - startTime;

      // 9. AdminLog
      await logAdminAction(
        db as unknown as PrismaClient,
        userId,
        "learning-suggestion",
        studentId,
        {
          studentId,
          type: resolvedType,
          weakPointCount: enrichedWeakPoints.length,
          durationMs,
        },
      ).catch((err) => jobLog.warn({ err }, "Failed to log admin action"));

      jobLog.info(
        { weakPointCount: enrichedWeakPoints.length, durationMs },
        "Learning suggestion generated",
      );
    },
  );
}
