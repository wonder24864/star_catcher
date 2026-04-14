/**
 * Report tRPC Router — Parent/Student learning reports.
 *
 * Provides mastery-based aggregations for weekly/monthly reports
 * (knowledge-point dimension progress + weak area analysis).
 *
 * - STUDENT: sees own data only
 * - PARENT: can view children via family relation verification
 *
 * See: docs/user-stories/parent-reports.md (US-041)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../trpc";
import { resolveStudentId } from "./shared/resolve-student-id";

// ─── Helpers ────────────────────────────────────

function dateRange(days: number): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

// ─── Router ─────────────────────────────────────

export const reportRouter = router({
  /**
   * Weekly report: 7-day mastery aggregation.
   */
  weeklyReport: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );
      return buildReport(ctx.db, studentId, 7);
    }),

  /**
   * Monthly report: 30-day mastery aggregation.
   */
  monthlyReport: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );
      return buildReport(ctx.db, studentId, 30);
    }),

  /**
   * Single KP progress timeline: intervention history + state transitions.
   */
  knowledgeProgress: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        knowledgePointId: z.string(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );

      const [mastery, interventions] = await Promise.all([
        ctx.db.masteryState.findUnique({
          where: {
            studentId_knowledgePointId: {
              studentId,
              knowledgePointId: input.knowledgePointId,
            },
          },
          include: {
            knowledgePoint: {
              select: { name: true, subject: true },
            },
          },
        }),
        ctx.db.interventionHistory.findMany({
          where: {
            studentId,
            knowledgePointId: input.knowledgePointId,
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
        }),
      ]);

      if (!mastery) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No mastery state found for this knowledge point",
        });
      }

      return {
        mastery,
        interventions,
      };
    }),
});

// ─── Report Builder ─────────────────────────────

async function buildReport(db: Context["db"], studentId: string, days: number) {
  const { start, end } = dateRange(days);

  // 1. Summary counts: KPs that changed status within the time window
  const [
    newMastered,
    newRegressed,
    newErrors,
    allStates,
    reviewSchedules,
    reviewInterventions,
    dailyMastered,
  ] = await Promise.all([
    // KPs that reached MASTERED in the window
    db.masteryState.count({
      where: {
        studentId,
        status: "MASTERED",
        masteredAt: { gte: start, lte: end },
      },
    }),
    // KPs that regressed in the window
    db.masteryState.count({
      where: {
        studentId,
        status: "REGRESSED",
        updatedAt: { gte: start, lte: end },
      },
    }),
    // KPs that became NEW_ERROR in the window
    db.masteryState.count({
      where: {
        studentId,
        status: "NEW_ERROR",
        createdAt: { gte: start, lte: end },
      },
    }),
    // All current mastery states for this student (for weak points)
    db.masteryState.findMany({
      where: {
        studentId,
        status: { in: ["NEW_ERROR", "CORRECTED", "REGRESSED"] },
      },
      include: {
        knowledgePoint: {
          select: { name: true, subject: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    // Review schedules due in the window (for completion rate)
    db.reviewSchedule.findMany({
      where: {
        studentId,
        nextReviewAt: { gte: start, lte: end },
      },
    }),
    // Completed reviews in the window
    db.interventionHistory.findMany({
      where: {
        studentId,
        type: "REVIEW",
        createdAt: { gte: start, lte: end },
      },
      select: { knowledgePointId: true },
    }),
    // Daily MASTERED trend: group by date
    db.masteryState.findMany({
      where: {
        studentId,
        status: "MASTERED",
        masteredAt: { gte: start, lte: end },
      },
      select: { masteredAt: true },
    }),
  ]);

  // 2. Build daily trend data
  const trendMap = new Map<string, number>();
  for (let d = 0; d < days; d++) {
    const date = new Date(start);
    date.setDate(date.getDate() + d);
    trendMap.set(date.toISOString().slice(0, 10), 0);
  }
  for (const ms of dailyMastered) {
    if (ms.masteredAt) {
      const key = ms.masteredAt.toISOString().slice(0, 10);
      trendMap.set(key, (trendMap.get(key) ?? 0) + 1);
    }
  }
  const masteryTrend = Array.from(trendMap.entries()).map(([date, count]) => ({
    date,
    count,
  }));

  // 3. Review completion rate
  const reviewsScheduled = reviewSchedules.length;
  const uniqueReviewedKPs = new Set(
    reviewInterventions.map((r) => r.knowledgePointId),
  );
  const reviewsCompleted = uniqueReviewedKPs.size;

  // 4. Weak points (top 5)
  const weakPoints = allStates.map((ms) => ({
    knowledgePointId: ms.knowledgePointId,
    name: ms.knowledgePoint.name,
    subject: ms.knowledgePoint.subject,
    status: ms.status,
    totalAttempts: ms.totalAttempts,
    correctAttempts: ms.correctAttempts,
    lastAttemptAt: ms.lastAttemptAt,
  }));

  return {
    period: days,
    summary: {
      newMastered,
      newRegressed,
      newErrors,
      reviewsScheduled,
      reviewsCompleted,
    },
    masteryTrend,
    weakPoints,
  };
}
