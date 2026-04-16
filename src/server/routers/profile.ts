/**
 * Student Profile tRPC Router.
 *
 * Provides learning profile data for students and parents:
 * - learningJourney: multi-source event timeline
 * - masteryDashboard: mastery counts grouped by subject
 * - historicalProgress: cumulative mastery trend over time
 *
 * RBAC: STUDENT(self) + PARENT(family) via resolveStudentId.
 * See: docs/user-stories/child-friendly-ui.md (US-070)
 */
import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { resolveStudentId } from "./shared/resolve-student-id";

// ─── Types ──────────────────────────────────────

type JourneyEvent = {
  type: string;
  kpName: string | null;
  subject: string | null;
  timestamp: Date;
  detail: string | null;
};

// ─── Router ─────────────────────────────────────

export const profileRouter = router({
  /**
   * Learning journey: merge events from 4 sources into a unified timeline.
   *
   * Sources (D49):
   * - ErrorQuestion (new errors encountered)
   * - MasteryState.masteredAt (mastery milestones)
   * - InterventionHistory (help/diagnosis events)
   * - HomeworkSession (homework completions)
   */
  learningJourney: protectedProcedure
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

      const [errorEvents, masteryEvents, interventionEvents, homeworkEvents] =
        await Promise.all([
          // Source 1: ErrorQuestion — "遇到新错题"
          ctx.db.errorQuestion.findMany({
            where: { studentId, deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              createdAt: true,
              subject: true,
              content: true,
              knowledgeMappings: {
                take: 1,
                select: {
                  knowledgePoint: { select: { name: true } },
                },
              },
            },
          }),

          // Source 2: MasteryState where masteredAt — "掌握了知识点" milestones
          ctx.db.masteryState.findMany({
            where: { studentId, masteredAt: { not: null } },
            orderBy: { masteredAt: "desc" },
            take: 50,
            select: {
              masteredAt: true,
              knowledgePoint: {
                select: { name: true, subject: true },
              },
            },
          }),

          // Source 3: InterventionHistory — "获得帮助/诊断"
          ctx.db.interventionHistory.findMany({
            where: { studentId },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              createdAt: true,
              type: true,
              knowledgePoint: {
                select: { name: true, subject: true },
              },
            },
          }),

          // Source 4: HomeworkSession completed — "完成作业"
          ctx.db.homeworkSession.findMany({
            where: { studentId, status: "COMPLETED" },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
              createdAt: true,
              subject: true,
              finalScore: true,
              title: true,
            },
          }),
        ]);

      // Map to unified event structure
      const events: JourneyEvent[] = [];

      for (const eq of errorEvents) {
        const kpName = eq.knowledgeMappings[0]?.knowledgePoint.name ?? null;
        events.push({
          type: "NEW_ERROR",
          kpName,
          subject: eq.subject,
          timestamp: eq.createdAt,
          detail: eq.content.slice(0, 80),
        });
      }

      for (const ms of masteryEvents) {
        events.push({
          type: "MASTERED",
          kpName: ms.knowledgePoint.name,
          subject: ms.knowledgePoint.subject,
          timestamp: ms.masteredAt!,
          detail: null,
        });
      }

      for (const ih of interventionEvents) {
        events.push({
          type: `INTERVENTION_${ih.type}`,
          kpName: ih.knowledgePoint.name,
          subject: ih.knowledgePoint.subject,
          timestamp: ih.createdAt,
          detail: null,
        });
      }

      for (const hs of homeworkEvents) {
        events.push({
          type: "HOMEWORK_COMPLETED",
          kpName: hs.title ?? null,
          subject: hs.subject,
          timestamp: hs.createdAt,
          detail: hs.finalScore != null ? String(hs.finalScore) : null,
        });
      }

      // Sort by timestamp descending, limit 100
      events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      return { events: events.slice(0, 100) };
    }),

  /**
   * Mastery dashboard: counts grouped by subject (D50).
   * Single $queryRaw GROUP BY, matching mastery.stats pattern.
   */
  masteryDashboard: protectedProcedure
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

      const rows = await ctx.db.$queryRaw<
        Array<{
          subject: string;
          total: bigint;
          mastered: bigint;
          inProgress: bigint;
          newError: bigint;
        }>
      >`
        SELECT kp.subject,
          COUNT(ms.id)::bigint as total,
          COUNT(CASE WHEN ms.status = 'MASTERED' THEN 1 END)::bigint as mastered,
          COUNT(CASE WHEN ms.status IN ('REVIEWING', 'CORRECTED') THEN 1 END)::bigint as "inProgress",
          COUNT(CASE WHEN ms.status IN ('NEW_ERROR', 'REGRESSED') THEN 1 END)::bigint as "newError"
        FROM "MasteryState" ms
        JOIN "KnowledgePoint" kp ON kp.id = ms."knowledgePointId"
        WHERE ms."studentId" = ${studentId}
          AND kp."deletedAt" IS NULL
        GROUP BY kp.subject
        ORDER BY total DESC
      `;

      const bySubject: Record<
        string,
        { total: number; mastered: number; inProgress: number; newError: number }
      > = {};

      for (const row of rows) {
        bySubject[row.subject] = {
          total: Number(row.total),
          mastered: Number(row.mastered),
          inProgress: Number(row.inProgress),
          newError: Number(row.newError),
        };
      }

      return { bySubject };
    }),

  /**
   * Historical progress: cumulative mastery trend (D51).
   * Step 1: baseline counts before period start.
   * Step 2: daily deltas within period.
   * TypeScript post-processing builds cumulative curve.
   */
  historicalProgress: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        period: z.enum(["30d", "90d"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );

      const days = input.period === "30d" ? 30 : 90;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Step 1: baseline — counts before period start
      const [baseline] = await ctx.db.$queryRaw<
        Array<{ baseTotal: bigint; baseMastered: bigint }>
      >`
        SELECT
          COUNT(*) FILTER (WHERE "createdAt" < ${startDate})::bigint as "baseTotal",
          COUNT(*) FILTER (WHERE "masteredAt" IS NOT NULL AND "masteredAt" < ${startDate})::bigint as "baseMastered"
        FROM "MasteryState"
        WHERE "studentId" = ${studentId}
      `;

      // Step 2: daily deltas within period
      const deltas = await ctx.db.$queryRaw<
        Array<{ date: Date; newTotal: bigint; newMastered: bigint }>
      >`
        SELECT dt::date as date, SUM(created)::bigint as "newTotal", SUM(mastered_inc)::bigint as "newMastered"
        FROM (
          SELECT "createdAt"::date as dt, 1 as created, 0 as mastered_inc
          FROM "MasteryState"
          WHERE "studentId" = ${studentId} AND "createdAt" >= ${startDate}
          UNION ALL
          SELECT "masteredAt"::date as dt, 0 as created, 1 as mastered_inc
          FROM "MasteryState"
          WHERE "studentId" = ${studentId} AND "masteredAt" IS NOT NULL AND "masteredAt" >= ${startDate}
        ) sub
        GROUP BY dt
        ORDER BY dt
      `;

      // Build date-keyed delta map
      const deltaMap = new Map<string, { newTotal: number; newMastered: number }>();
      for (const d of deltas) {
        const key = toDateString(d.date);
        deltaMap.set(key, {
          newTotal: Number(d.newTotal),
          newMastered: Number(d.newMastered),
        });
      }

      // Build cumulative curve, filling date gaps
      let runningTotal = baseline ? Number(baseline.baseTotal) : 0;
      let runningMastered = baseline ? Number(baseline.baseMastered) : 0;
      const dailyCounts: Array<{ date: string; mastered: number; total: number }> = [];

      const cursor = new Date(startDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      while (cursor <= today) {
        const key = toDateString(cursor);
        const delta = deltaMap.get(key);
        if (delta) {
          runningTotal += delta.newTotal;
          runningMastered += delta.newMastered;
        }
        dailyCounts.push({
          date: key,
          mastered: runningMastered,
          total: runningTotal,
        });
        cursor.setDate(cursor.getDate() + 1);
      }

      return { dailyCounts };
    }),
});

// ─── Helpers ────────────────────────────────────

/** Format Date to YYYY-MM-DD string. */
function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
