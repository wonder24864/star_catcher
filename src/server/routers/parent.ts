import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../trpc";
import { logAdminAction } from "@/lib/domain/admin-log";

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
   * Get maxHelpLevel config for all students under this parent.
   */
  getStudentConfigs: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.session.role !== "PARENT") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const myFamilies = await ctx.db.familyMember.findMany({
      where: { userId: ctx.session.userId },
      select: { familyId: true },
    });
    const familyIds = myFamilies.map((f) => f.familyId);
    if (familyIds.length === 0) return [];

    const studentMembers = await ctx.db.familyMember.findMany({
      where: { familyId: { in: familyIds }, user: { role: "STUDENT" } },
      include: { user: { select: { id: true, nickname: true, grade: true } } },
    });
    const seen = new Set<string>();
    const students = studentMembers
      .filter((m) => {
        if (seen.has(m.user.id)) return false;
        seen.add(m.user.id);
        return true;
      })
      .map((m) => m.user);

    const configs = await ctx.db.parentStudentConfig.findMany({
      where: { parentId: ctx.session.userId },
    });
    const configMap = new Map(configs.map((c) => [c.studentId, c]));

    return students.map((s) => {
      const cfg = configMap.get(s.id);
      return {
        studentId: s.id,
        nickname: s.nickname,
        grade: s.grade,
        maxHelpLevel:
          cfg?.maxHelpLevel ?? (s.grade?.startsWith("PRIMARY_") ? 2 : 3),
        maxDailyTasks: cfg?.maxDailyTasks ?? 10,
        learningTimeStart: cfg?.learningTimeStart ?? null,
        learningTimeEnd: cfg?.learningTimeEnd ?? null,
      };
    });
  }),

  /**
   * Set maxHelpLevel for a specific student (upsert ParentStudentConfig).
   */
  setMaxHelpLevel: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        maxHelpLevel: z.number().int().min(1).max(3),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);
      return ctx.db.parentStudentConfig.upsert({
        where: {
          parentId_studentId: {
            parentId: ctx.session.userId,
            studentId: input.studentId,
          },
        },
        create: {
          parentId: ctx.session.userId,
          studentId: input.studentId,
          maxHelpLevel: input.maxHelpLevel,
        },
        update: { maxHelpLevel: input.maxHelpLevel },
      });
    }),

  /**
   * Read the learning-control settings (maxDailyTasks + learning hours window)
   * for a specific student. Falls back to defaults if no config row exists.
   * See: docs/user-stories/parent-learning-control.md (US-054)
   */
  getLearningControl: protectedProcedure
    .input(z.object({ studentId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const cfg = await ctx.db.parentStudentConfig.findUnique({
        where: {
          parentId_studentId: {
            parentId: ctx.session.userId,
            studentId: input.studentId,
          },
        },
        select: {
          maxDailyTasks: true,
          learningTimeStart: true,
          learningTimeEnd: true,
        },
      });

      return {
        maxDailyTasks: cfg?.maxDailyTasks ?? 10,
        learningTimeStart: cfg?.learningTimeStart ?? null,
        learningTimeEnd: cfg?.learningTimeEnd ?? null,
      };
    }),

  /**
   * Set per-student learning controls. Upserts ParentStudentConfig and
   * writes an AdminLog entry (action="parent-setting") for audit.
   * See: docs/user-stories/parent-learning-control.md (US-054)
   */
  setLearningControl: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        maxDailyTasks: z.number().int().min(0).max(20),
        learningTimeStart: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
        learningTimeEnd: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const updated = await ctx.db.parentStudentConfig.upsert({
        where: {
          parentId_studentId: {
            parentId: ctx.session.userId,
            studentId: input.studentId,
          },
        },
        create: {
          parentId: ctx.session.userId,
          studentId: input.studentId,
          // Create-only default mirrors the existing maxHelpLevel default (2);
          // update branches do not touch maxHelpLevel.
          maxHelpLevel: 2,
          maxDailyTasks: input.maxDailyTasks,
          learningTimeStart: input.learningTimeStart,
          learningTimeEnd: input.learningTimeEnd,
        },
        update: {
          maxDailyTasks: input.maxDailyTasks,
          learningTimeStart: input.learningTimeStart,
          learningTimeEnd: input.learningTimeEnd,
        },
      });

      await logAdminAction(
        ctx.db as unknown as PrismaClient,
        ctx.session.userId,
        "parent-setting",
        input.studentId,
        {
          maxDailyTasks: input.maxDailyTasks,
          learningTimeStart: input.learningTimeStart,
          learningTimeEnd: input.learningTimeEnd,
        },
      );

      return updated;
    }),

  /**
   * Recent parent-setting changes this parent has made for a given student.
   * RBAC: PARENT + family. Filtering by `adminId = ctx.session.userId` gives
   * each parent their own audit trail.
   */
  recentSettingLogs: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        limit: z.number().int().min(1).max(50).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const rows = await ctx.db.adminLog.findMany({
        where: {
          adminId: ctx.session.userId,
          target: input.studentId,
          action: "parent-setting",
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        select: {
          id: true,
          action: true,
          details: true,
          createdAt: true,
        },
      });

      return rows;
    }),

  /**
   * Basic statistics for a student over the last 7 or 30 days.
   * Returns pre-aggregated data for rendering charts on the frontend.
   */
  stats: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        period: z.enum(["7d", "30d"]).default("7d"),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const days = input.period === "7d" ? 7 : 30;
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - days);
      since.setUTCHours(0, 0, 0, 0);

      // Fetch raw data
      const [errorQuestions, sessions] = await Promise.all([
        ctx.db.errorQuestion.findMany({
          where: { studentId: input.studentId, deletedAt: null, createdAt: { gte: since } },
        }),
        ctx.db.homeworkSession.findMany({
          where: { studentId: input.studentId, status: "COMPLETED", createdAt: { gte: since } },
        }),
      ]);

      // Get help requests for these sessions
      const sessionIds = (sessions as unknown as { id: string }[]).map((s) => s.id);
      const helpRequests = sessionIds.length
        ? await ctx.db.helpRequest.findMany({
            where: { homeworkSessionId: { in: sessionIds } },
          })
        : [];

      // Build day keys for the period
      const dayKeys: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - i);
        dayKeys.push(d.toISOString().slice(0, 10));
      }

      // errors by day
      const errorsByDay = dayKeys.map((date) => ({
        date,
        count: errorQuestions.filter(
          (e) => e.createdAt.toISOString().slice(0, 10) === date
        ).length,
      }));

      // subject distribution
      const subjectMap = new Map<string, number>();
      for (const e of errorQuestions) {
        subjectMap.set(e.subject, (subjectMap.get(e.subject) ?? 0) + 1);
      }
      const subjectDistribution = Array.from(subjectMap.entries())
        .map(([subject, count]) => ({ subject, count }))
        .sort((a, b) => b.count - a.count);

      // avg score by day
      const avgScoreByDay = dayKeys.map((date) => {
        const daySessions = sessions.filter(
          (s) => s.createdAt.toISOString().slice(0, 10) === date && s.finalScore != null
        );
        const avg =
          daySessions.length === 0
            ? null
            : daySessions.reduce((sum, s) => sum + (s.finalScore ?? 0), 0) / daySessions.length;
        return { date, avgScore: avg == null ? null : Math.round(avg) };
      });

      // check count by day
      const checkCountByDay = dayKeys.map((date) => ({
        date,
        count: sessions.filter(
          (s) => s.createdAt.toISOString().slice(0, 10) === date
        ).length,
      }));

      // help frequency by subject (via sessions)
      const sessionSubjectMap = new Map<string, string>();
      for (const s of sessions) {
        const id = (s as unknown as { id: string }).id;
        if (id && s.subject) sessionSubjectMap.set(id, s.subject);
      }
      const helpSubjectMap = new Map<string, number>();
      for (const hr of helpRequests) {
        const subj = sessionSubjectMap.get(
          (hr as unknown as { homeworkSessionId: string }).homeworkSessionId
        );
        if (subj) helpSubjectMap.set(subj, (helpSubjectMap.get(subj) ?? 0) + 1);
      }
      const helpFreqBySubject = Array.from(helpSubjectMap.entries())
        .map(([subject, count]) => ({ subject, count }))
        .sort((a, b) => b.count - a.count);

      return {
        period: input.period,
        errorsByDay,
        subjectDistribution,
        avgScoreByDay,
        checkCountByDay,
        helpFreqBySubject,
        totalErrors: errorQuestions.length,
        totalChecks: sessions.length,
      };
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
