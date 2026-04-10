import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../trpc";

async function verifyParentStudentAccess(
  db: Context["db"],
  parentId: string,
  studentId: string
) {
  const parentFamilies = await db.familyMember.findMany({
    where: { userId: parentId },
    select: { familyId: true },
  });
  const familyIds = parentFamilies.map((f) => f.familyId);
  if (familyIds.length === 0) throw new TRPCError({ code: "FORBIDDEN" });

  const studentInFamily = await db.familyMember.findFirst({
    where: { userId: studentId, familyId: { in: familyIds } },
  });
  if (!studentInFamily) throw new TRPCError({ code: "FORBIDDEN" });
}

export const parentRouter = router({
  /**
   * Today's overview: all sessions for a student on a given date.
   * Returns help request counts grouped by level (L1/L2/L3).
   * date: "YYYY-MM-DD" (UTC)
   */
  overview: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const dayStart = new Date(`${input.date}T00:00:00.000Z`);
      const dayEnd = new Date(`${input.date}T23:59:59.999Z`);

      const sessions = await ctx.db.homeworkSession.findMany({
        where: {
          studentId: input.studentId,
          createdAt: { gte: dayStart, lte: dayEnd },
        },
        include: {
          helpRequests: { select: { level: true } },
          checkRounds: {
            orderBy: { roundNumber: "asc" },
            select: { roundNumber: true, score: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return sessions.map((s) => {
        const helpByLevel: Record<number, number> = {};
        for (const hr of s.helpRequests) {
          helpByLevel[hr.level] = (helpByLevel[hr.level] ?? 0) + 1;
        }
        return {
          id: s.id,
          title: s.title,
          subject: s.subject,
          contentType: s.contentType,
          status: s.status,
          finalScore: s.finalScore,
          totalRounds: s.totalRounds,
          createdAt: s.createdAt,
          helpByLevel,
          checkRounds: s.checkRounds,
        };
      });
    }),

  /**
   * Session detail for parent read-only view.
   * Includes checkRounds (with per-question results) and helpRequests.
   */
  sessionDetail: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const session = await ctx.db.homeworkSession.findUnique({
        where: { id: input.sessionId },
        include: {
          questions: { orderBy: { questionNumber: "asc" } },
          checkRounds: {
            orderBy: { roundNumber: "asc" },
            include: { results: true },
          },
          helpRequests: { orderBy: { level: "asc" } },
        },
      });
      if (!session) throw new TRPCError({ code: "NOT_FOUND" });
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, session.studentId);
      return session;
    }),

  /**
   * Weekly check-in: which days in a 7-day window had homework sessions.
   * weekStart: "YYYY-MM-DD" (Monday of the week, UTC)
   */
  weeklyCheckin: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const start = new Date(`${input.weekStart}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 7);

      const sessions = await ctx.db.homeworkSession.findMany({
        where: {
          studentId: input.studentId,
          createdAt: { gte: start, lt: end },
        },
        select: { createdAt: true },
      });

      const sessionDays = new Set(
        sessions.map((s) => s.createdAt.toISOString().slice(0, 10))
      );

      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        const date = d.toISOString().slice(0, 10);
        return { date, hasSession: sessionDays.has(date) };
      });
    }),
});
