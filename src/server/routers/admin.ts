import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { hash } from "bcryptjs";
import { router, adminProcedure } from "../trpc";
import { enqueueWeaknessProfile } from "@/lib/infra/queue";

/** Generate a random temp password: 8 chars, letters + digits */
function genTempPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export const adminRouter = router({
  /** List users with search + pagination */
  listUsers: adminProcedure
    .input(
      z.object({
        search: z.string().optional(),
        role: z.enum(["STUDENT", "PARENT", "ADMIN"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {

      const where = {
        deletedAt: null,
        ...(input.role ? { role: input.role } : {}),
        ...(input.search
          ? {
              OR: [
                { username: { contains: input.search, mode: "insensitive" as const } },
                { nickname: { contains: input.search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [total, users] = await Promise.all([
        ctx.db.user.count({ where }),
        ctx.db.user.findMany({
          where,
          select: {
            id: true,
            username: true,
            nickname: true,
            role: true,
            grade: true,
            isActive: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
        }),
      ]);

      return { users, total, page: input.page, pageSize: input.pageSize };
    }),

  /** User detail: profile + family memberships + stats */
  getUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {

      const user = await ctx.db.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        select: {
          id: true,
          username: true,
          nickname: true,
          role: true,
          grade: true,
          locale: true,
          isActive: true,
          loginFailCount: true,
          lockedUntil: true,
          createdAt: true,
          familyMemberships: {
            select: {
              role: true,
              joinedAt: true,
              family: { select: { id: true, name: true } },
            },
          },
        },
      });

      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const [sessionCount, errorCount] = await Promise.all([
        ctx.db.homeworkSession.count({ where: { studentId: input.userId } }),
        ctx.db.errorQuestion.count({
          where: { studentId: input.userId, deletedAt: null },
        }),
      ]);

      return { ...user, sessionCount, errorCount };
    }),

  /** Disable or enable a user account */
  toggleUser: adminProcedure
    .input(z.object({ userId: z.string(), isActive: z.boolean() }))
    .mutation(async ({ ctx, input }) => {

      if (input.userId === ctx.session.userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot disable your own account",
        });
      }

      const user = await ctx.db.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.user.update({
        where: { id: input.userId },
        data: { isActive: input.isActive },
      });

      await ctx.db.adminLog.create({
        data: {
          adminId: ctx.session.userId,
          action: input.isActive ? "ENABLE_USER" : "DISABLE_USER",
          target: input.userId,
        },
      });

      return { success: true };
    }),

  /** Reset user password — returns temp password to relay to user */
  resetPassword: adminProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {

      const user = await ctx.db.user.findFirst({
        where: { id: input.userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      const tempPassword = genTempPassword();
      const hashed = await hash(tempPassword, 12);

      await ctx.db.user.update({
        where: { id: input.userId },
        data: { password: hashed, loginFailCount: 0, lockedUntil: null },
      });

      await ctx.db.adminLog.create({
        data: {
          adminId: ctx.session.userId,
          action: "RESET_PASSWORD",
          target: input.userId,
        },
      });

      return { tempPassword };
    }),

  /** System-wide stats: user counts by role, errors, sessions, AI calls */
  getStats: adminProcedure.query(async ({ ctx }) => {

    const [usersByRole, totalErrors, totalSessions, totalAiCalls] =
      await Promise.all([
        ctx.db.user.groupBy({
          by: ["role"],
          where: { deletedAt: null },
          _count: { id: true },
        }),
        ctx.db.errorQuestion.count({ where: { deletedAt: null } }),
        ctx.db.homeworkSession.count(),
        ctx.db.aICallLog.count(),
      ]);

    const roleMap: Record<string, number> = {};
    for (const r of usersByRole) {
      roleMap[r.role] = r._count.id;
    }

    return {
      totalUsers: (roleMap["STUDENT"] ?? 0) + (roleMap["PARENT"] ?? 0) + (roleMap["ADMIN"] ?? 0),
      studentCount: roleMap["STUDENT"] ?? 0,
      parentCount: roleMap["PARENT"] ?? 0,
      adminCount: roleMap["ADMIN"] ?? 0,
      totalErrors,
      totalSessions,
      totalAiCalls,
    };
  }),

  /** Dashboard aggregates: stats + weekly active + avg mastery + recent logs */
  dashboard: adminProcedure.query(async ({ ctx }) => {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);

    const [
      usersByRole,
      totalErrors,
      weeklyActiveSessions,
      masteryCounts,
      recentLogs,
    ] = await Promise.all([
      ctx.db.user.groupBy({
        by: ["role"],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      ctx.db.errorQuestion.count({ where: { deletedAt: null } }),
      ctx.db.homeworkSession.count({
        where: { createdAt: { gte: weekStart } },
      }),
      Promise.all([
        ctx.db.masteryState.count({ where: { archived: false } }),
        ctx.db.masteryState.count({ where: { archived: false, status: "MASTERED" } }),
      ]),
      ctx.db.adminLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          action: true,
          target: true,
          createdAt: true,
          admin: { select: { nickname: true } },
        },
      }),
    ]);

    const roleMap: Record<string, number> = {};
    for (const r of usersByRole) {
      roleMap[r.role] = r._count.id;
    }

    return {
      studentCount: roleMap["STUDENT"] ?? 0,
      parentCount: roleMap["PARENT"] ?? 0,
      adminCount: roleMap["ADMIN"] ?? 0,
      totalErrors,
      weeklyActiveSessions,
      avgMastery: masteryCounts[0] > 0
        ? Math.round((masteryCounts[1] / masteryCounts[0]) * 100)
        : 0,
      recentLogs,
    };
  }),

  /** Get one or more SystemConfig values by key */
  getConfig: adminProcedure
    .input(z.object({ keys: z.array(z.string()).min(1) }))
    .query(async ({ ctx, input }) => {

      const rows = await ctx.db.systemConfig.findMany({
        where: { key: { in: input.keys } },
        select: { key: true, value: true },
      });

      const result: Record<string, unknown> = {};
      for (const row of rows) {
        result[row.key] = row.value;
      }
      return result;
    }),

  /** Upsert a SystemConfig key */
  setConfig: adminProcedure
    .input(z.object({ key: z.string().min(1), value: z.unknown() }))
    .mutation(async ({ ctx, input }) => {

      await ctx.db.systemConfig.upsert({
        where: { key: input.key },
        create: { key: input.key, value: input.value as never },
        update: { value: input.value as never },
      });

      await ctx.db.adminLog.create({
        data: {
          adminId: ctx.session.userId,
          action: "SET_CONFIG",
          target: input.key,
          details: { value: input.value },
        },
      });

      return { success: true };
    }),

  /**
   * Trigger weakness profile analysis for a student.
   * Used for GLOBAL (semester-end) or manual PERIODIC re-analysis.
   */
  triggerWeaknessProfile: adminProcedure
    .input(
      z.object({
        studentId: z.string().min(1),
        tier: z.enum(["PERIODIC", "GLOBAL"]).default("GLOBAL"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const jobId = await enqueueWeaknessProfile({
        studentId: input.studentId,
        userId: ctx.session.userId,
        locale: "zh",
        tier: input.tier,
      });
      return { jobId };
    }),
});
