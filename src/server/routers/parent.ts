import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";
import type { Context } from "../trpc";
import { logAdminAction } from "@/lib/domain/admin-log";
import { enqueueLearningSuggestion } from "@/lib/infra/queue";
import { createTaskRun } from "@/lib/task-runner";
import { gradeEnum } from "@/lib/domain/validations/grade";

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

  /**
   * Correction rate distribution: ErrorQuestion grouped by subject × attempt bucket.
   * Buckets: 1 attempt, 2 attempts, 3+ attempts.
   */
  correctionRateDistribution: protectedProcedure
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

      const errorQuestions = await ctx.db.errorQuestion.findMany({
        where: { studentId: input.studentId, deletedAt: null, createdAt: { gte: since } },
        select: { subject: true, totalAttempts: true },
      });

      const map = new Map<string, { oneAttempt: number; twoAttempts: number; threeOrMore: number }>();
      for (const eq of errorQuestions) {
        let entry = map.get(eq.subject);
        if (!entry) {
          entry = { oneAttempt: 0, twoAttempts: 0, threeOrMore: 0 };
          map.set(eq.subject, entry);
        }
        if (eq.totalAttempts <= 1) entry.oneAttempt++;
        else if (eq.totalAttempts === 2) entry.twoAttempts++;
        else entry.threeOrMore++;
      }

      const bySubject = Array.from(map.entries())
        .map(([subject, counts]) => ({ subject, ...counts }))
        .sort((a, b) => {
          const totalB = b.oneAttempt + b.twoAttempts + b.threeOrMore;
          const totalA = a.oneAttempt + a.twoAttempts + a.threeOrMore;
          return totalB - totalA;
        });

      return { bySubject };
    }),

  /**
   * Help frequency detail: HelpRequest grouped by subject × help level (L1/L2/L3).
   * Joins through HomeworkSession to resolve subject.
   */
  helpFrequencyDetail: protectedProcedure
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

      // Fetch sessions for the student in the period to build subject map
      const sessions = await ctx.db.homeworkSession.findMany({
        where: { studentId: input.studentId, createdAt: { gte: since } },
        select: { id: true, subject: true },
      });
      const sessionSubjectMap = new Map<string, string>();
      for (const s of sessions) {
        if (s.subject) sessionSubjectMap.set(s.id, s.subject);
      }

      const sessionIds = sessions.map((s) => s.id);
      const helpRequests = sessionIds.length
        ? await ctx.db.helpRequest.findMany({
            where: { homeworkSessionId: { in: sessionIds } },
            select: { homeworkSessionId: true, level: true },
          })
        : [];

      const map = new Map<string, { L1: number; L2: number; L3: number }>();
      for (const hr of helpRequests) {
        const subject = sessionSubjectMap.get(hr.homeworkSessionId);
        if (!subject) continue; // skip null-subject sessions
        let entry = map.get(subject);
        if (!entry) {
          entry = { L1: 0, L2: 0, L3: 0 };
          map.set(subject, entry);
        }
        if (hr.level === 1) entry.L1++;
        else if (hr.level === 2) entry.L2++;
        else if (hr.level === 3) entry.L3++;
      }

      const bySubject = Array.from(map.entries())
        .map(([subject, counts]) => ({ subject, ...counts }))
        .sort((a, b) => (b.L1 + b.L2 + b.L3) - (a.L1 + a.L2 + a.L3));

      return { bySubject };
    }),

  /**
   * Multi-student comparison: aggregated metrics for all students under the parent.
   * Server-side aggregation with batch queries (no N+1).
   */
  multiStudentComparison: protectedProcedure
    .input(
      z.object({
        period: z.enum(["7d", "30d"]).default("7d"),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Resolve all students in parent's families (same as family.students)
      const myFamilies = await ctx.db.familyMember.findMany({
        where: { userId: ctx.session.userId },
        select: { familyId: true },
      });
      const familyIds = myFamilies.map((f) => f.familyId);
      if (familyIds.length === 0) return { students: [] };

      const studentMembers = await ctx.db.familyMember.findMany({
        where: {
          familyId: { in: familyIds },
          user: { role: "STUDENT" },
        },
        include: {
          user: { select: { id: true, nickname: true, grade: true } },
        },
      });

      // Deduplicate students
      const seen = new Set<string>();
      const studentList = studentMembers
        .filter((m) => {
          if (seen.has(m.user.id)) return false;
          seen.add(m.user.id);
          return true;
        })
        .map((m) => m.user);

      if (studentList.length === 0) return { students: [] };

      const studentIds = studentList.map((s) => s.id);

      const days = input.period === "7d" ? 7 : 30;
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - days);
      since.setUTCHours(0, 0, 0, 0);

      // Batch queries — all students in one round trip
      const [allErrors, allSessions] = await Promise.all([
        ctx.db.errorQuestion.findMany({
          where: { studentId: { in: studentIds }, deletedAt: null, createdAt: { gte: since } },
          select: { studentId: true, correctAttempts: true, isMastered: true },
        }),
        ctx.db.homeworkSession.findMany({
          where: { studentId: { in: studentIds }, createdAt: { gte: since } },
          select: { id: true, studentId: true },
        }),
      ]);

      // Help requests for all sessions
      const allSessionIds = allSessions.map((s) => s.id);
      const allHelps = allSessionIds.length
        ? await ctx.db.helpRequest.findMany({
            where: { homeworkSessionId: { in: allSessionIds } },
            select: { homeworkSessionId: true },
          })
        : [];

      // Build session→student map for help requests
      const sessionStudentMap = new Map<string, string>();
      for (const s of allSessions) {
        sessionStudentMap.set(s.id, s.studentId);
      }

      // Aggregate per student
      const students = studentList.map((student) => {
        const errors = allErrors.filter((e) => e.studentId === student.id);
        const errorCount = errors.length;
        const correctedCount = errors.filter((e) => e.correctAttempts > 0).length;
        const masteredCount = errors.filter((e) => e.isMastered).length;
        const helpCount = allHelps.filter(
          (h) => sessionStudentMap.get(h.homeworkSessionId) === student.id
        ).length;

        return {
          id: student.id,
          name: student.nickname,
          grade: student.grade,
          errorCount,
          correctionRate: errorCount > 0 ? correctedCount / errorCount : 0,
          helpFrequency: helpCount,
          masteryRate: errorCount > 0 ? masteredCount / errorCount : 0,
        };
      });

      return { students };
    }),

  // ─── Sprint 18: Learning Suggestions (US-061) ──────────────

  /**
   * Get latest learning suggestions for a student.
   */
  getLearningSuggestions: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        limit: z.number().int().min(1).max(20).default(5),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const suggestions = await ctx.db.learningSuggestion.findMany({
        where: { studentId: input.studentId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      return { suggestions };
    }),

  /**
   * Request on-demand learning suggestions for a student.
   * Cooldown: 1 hour between ON_DEMAND requests for the same student.
   */
  requestLearningSuggestions: protectedProcedure
    .input(z.object({ studentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      // Cooldown check: 1 hour for ON_DEMAND
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentOnDemand = await ctx.db.learningSuggestion.findFirst({
        where: {
          studentId: input.studentId,
          type: "ON_DEMAND",
          createdAt: { gte: oneHourAgo },
        },
        orderBy: { createdAt: "desc" },
      });

      if (recentOnDemand) {
        const nextAvailableAt = new Date(
          recentOnDemand.createdAt.getTime() + 60 * 60 * 1000
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `On-demand suggestion cooldown active. Next available at ${nextAvailableAt.toISOString()}`,
        });
      }

      const taskKey = `suggestion:${input.studentId}`;
      const { task: taskRun, isNew } = await createTaskRun(ctx.db, {
        type: "SUGGESTION",
        key: taskKey,
        userId: ctx.session.userId,
        studentId: input.studentId,
      });

      let jobId = taskRun.bullJobId ?? null;
      if (isNew) {
        jobId = await enqueueLearningSuggestion({
          studentId: input.studentId,
          userId: ctx.session.userId,
          locale: ctx.session.locale ?? "zh",
          type: "ON_DEMAND",
          taskId: taskRun.id,
        });
      }

      return { jobId, taskId: taskRun.id, taskKey };
    }),

  // ─── Sprint 18: Intervention Tracking (US-062) ──────────────

  /**
   * Intervention effect: compare preMastery → currentMastery per KP.
   */
  interventionEffect: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        period: z.enum(["7d", "30d"]),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const since = new Date();
      since.setDate(since.getDate() - (input.period === "7d" ? 7 : 30));

      // Get interventions with KP names
      const interventions = await ctx.db.interventionHistory.findMany({
        where: {
          studentId: input.studentId,
          createdAt: { gte: since },
        },
        include: {
          knowledgePoint: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      // Get current mastery states for intervened KPs
      const kpIds = [...new Set(interventions.map((i) => i.knowledgePointId))];
      const masteryStates = await ctx.db.masteryState.findMany({
        where: {
          studentId: input.studentId,
          knowledgePointId: { in: kpIds },
        },
        select: { knowledgePointId: true, status: true },
      });
      const currentMasteryMap = new Map(
        masteryStates.map((ms) => [ms.knowledgePointId, ms.status])
      );

      // Build effect per KP (most recent intervention per KP)
      const seenKPs = new Set<string>();
      const effects: Array<{
        kpId: string;
        kpName: string;
        preMastery: string | null;
        postMastery: string;
        delta: number;
        interventionType: string;
      }> = [];

      // Status ordinals for delta calculation
      const statusOrder: Record<string, number> = {
        NEW_ERROR: 0,
        CORRECTED: 1,
        REVIEWING: 2,
        REGRESSED: 1,
        MASTERED: 3,
      };

      for (const intervention of interventions) {
        if (seenKPs.has(intervention.knowledgePointId)) continue;
        seenKPs.add(intervention.knowledgePointId);

        const currentStatus =
          currentMasteryMap.get(intervention.knowledgePointId) ?? "NEW_ERROR";
        const preStatus = intervention.preMasteryStatus;
        const delta =
          preStatus != null
            ? (statusOrder[currentStatus] ?? 0) - (statusOrder[preStatus] ?? 0)
            : 0;

        effects.push({
          kpId: intervention.knowledgePointId,
          kpName: intervention.knowledgePoint.name,
          preMastery: preStatus,
          postMastery: currentStatus,
          delta,
          interventionType: intervention.type,
        });
      }

      return { effects };
    }),

  /**
   * Intervention timeline: recent intervention events with KP details.
   */
  interventionTimeline: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      const interventions = await ctx.db.interventionHistory.findMany({
        where: { studentId: input.studentId },
        include: {
          knowledgePoint: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });

      // Get current mastery for each KP
      const kpIds = [...new Set(interventions.map((i) => i.knowledgePointId))];
      const masteryStates = await ctx.db.masteryState.findMany({
        where: {
          studentId: input.studentId,
          knowledgePointId: { in: kpIds },
        },
        select: { knowledgePointId: true, status: true },
      });
      const currentMasteryMap = new Map(
        masteryStates.map((ms) => [ms.knowledgePointId, ms.status])
      );

      const events = interventions.map((i) => ({
        id: i.id,
        type: i.type,
        kpName: i.knowledgePoint.name,
        timestamp: i.createdAt,
        preMastery: i.preMasteryStatus,
        currentMastery:
          currentMasteryMap.get(i.knowledgePointId) ?? "NEW_ERROR",
        status: i.foundationalWeakness ? "foundational" : "normal",
      }));

      return { events };
    }),

  /**
   * Parent updates a linked student's profile (grade / nickname).
   * Only STUDENT-role users in the same family can be updated.
   */
  updateStudentProfile: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        grade: gradeEnum.optional(),
        nickname: z.string().min(1).max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await verifyParentStudentAccess(ctx.db, ctx.session.userId, input.studentId);

      // Guard: target must be STUDENT role (don't let parents rewrite other parents)
      const target = await ctx.db.user.findUnique({
        where: { id: input.studentId },
        select: { role: true },
      });
      if (!target || target.role !== "STUDENT") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "NOT_A_STUDENT" });
      }

      const patch: { grade?: z.infer<typeof gradeEnum>; nickname?: string } = {};
      if (input.grade !== undefined) patch.grade = input.grade;
      if (input.nickname !== undefined) patch.nickname = input.nickname;

      if (Object.keys(patch).length === 0) {
        return { success: true };
      }

      await ctx.db.user.update({
        where: { id: input.studentId },
        data: patch,
      });
      return { success: true };
    }),
});
