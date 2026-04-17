/**
 * Brain 监控 tRPC Router (Sprint 15 US-057, Sprint 23 D55/D56)
 *
 * Admin-only procedures:
 *   - listRuns:         Brain 执行历史（读 AdminLog action="brain-run"）
 *   - studentStatus:    单学生状态（最近 run + cooldown + 下次 cron）
 *   - stats:            最近 N 天的 Brain 聚合统计
 *   - triggerBrain:     手动触发指定学生的 Brain（D56）
 *   - overrideCooldown: 清除冷却（D56）
 *
 * 数据来源：
 *   - AdminLog（action="brain-run"） — 每次 Brain 执行的结构化记录
 *   - Redis `brain:intervention-cooldown:{sid}` — 渐进冷却 tier 1=6h/2=12h/3=24h（D55）
 *   - SCHEDULE_REGISTRY — 静态读 cron 配置
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma, type PrismaClient } from "@prisma/client";
import { router, adminProcedure } from "../trpc";
import { redis } from "@/lib/infra/redis";
import { SCHEDULE_REGISTRY } from "@/worker/schedule-registry";
import { cooldownKey, parseCooldownValue, getCooldownTTL } from "@/lib/domain/brain";
import { enqueueLearningBrain } from "@/lib/infra/queue";
import { logAdminAction } from "@/lib/domain/admin-log";
import { subscribeToBrainRun, type BrainRunEvent } from "@/lib/infra/events";

// ─── 类型 ──────────────────────────────────────────────────────

type BrainRunDetails = {
  studentId?: string;
  eventsProcessed?: number;
  agentsLaunched?: Array<{ jobName: string; reason: string }>;
  skipped?: Array<{ jobName: string; reason: string }>;
  durationMs?: number;
};

function parseBrainRunDetails(details: Prisma.JsonValue | null): BrainRunDetails {
  if (!details || typeof details !== "object" || Array.isArray(details)) return {};
  return details as BrainRunDetails;
}

// ─── Router ────────────────────────────────────────────────────

export const brainRouter = router({
  /**
   * Brain 执行历史。读 AdminLog 并 JOIN 学生 nickname。
   */
  listRuns: adminProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        skippedOnly: z.boolean().default(false),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      // skippedOnly 通过 PostgreSQL JSONB 函数在 SQL 层过滤
      // （而非 JS 层过滤，否则分页失效：第 1 页 filter 后可能为空但后续页还有数据）
      const skippedSql = Prisma.sql`
        jsonb_array_length(COALESCE("details"->'agentsLaunched', '[]'::jsonb)) = 0
        AND jsonb_array_length(COALESCE("details"->'skipped', '[]'::jsonb)) > 0
      `;

      // 构建过滤条件 (parameterized)
      const conditions: Prisma.Sql[] = [Prisma.sql`"action" = 'brain-run'`];
      if (input.studentId) {
        conditions.push(Prisma.sql`"target" = ${input.studentId}`);
      }
      if (input.dateFrom) {
        conditions.push(Prisma.sql`"createdAt" >= ${input.dateFrom}`);
      }
      if (input.dateTo) {
        conditions.push(Prisma.sql`"createdAt" <= ${input.dateTo}`);
      }
      if (input.skippedOnly) {
        conditions.push(skippedSql);
      }
      const whereSql = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;

      const offset = (input.page - 1) * input.pageSize;

      const [rows, totalRows] = await Promise.all([
        ctx.db.$queryRaw<
          Array<{
            id: string;
            target: string | null;
            details: Prisma.JsonValue;
            createdAt: Date;
          }>
        >(Prisma.sql`
          SELECT "id", "target", "details", "createdAt"
          FROM "AdminLog"
          ${whereSql}
          ORDER BY "createdAt" DESC
          LIMIT ${input.pageSize} OFFSET ${offset}
        `),
        ctx.db.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count FROM "AdminLog" ${whereSql}
        `),
      ]);

      const total = Number(totalRows[0]?.count ?? 0);

      // Collect unique student IDs → fetch nicknames in one query
      const studentIds = Array.from(
        new Set(rows.map((r) => r.target).filter((t): t is string => !!t)),
      );
      const students =
        studentIds.length > 0
          ? await ctx.db.user.findMany({
              where: { id: { in: studentIds } },
              select: { id: true, nickname: true, username: true },
            })
          : [];
      const studentMap = new Map(students.map((s) => [s.id, s]));

      const items = rows.map((r) => {
        const d = parseBrainRunDetails(r.details);
        const skipped = d.skipped ?? [];
        return {
          id: r.id,
          createdAt: r.createdAt,
          studentId: r.target,
          student: r.target ? studentMap.get(r.target) ?? null : null,
          eventsProcessed: d.eventsProcessed ?? 0,
          agentsLaunched: d.agentsLaunched ?? [],
          skipped,
          durationMs: d.durationMs ?? 0,
          isSkipped: skipped.length > 0 && (d.agentsLaunched?.length ?? 0) === 0,
        };
      });

      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * 单学生 Brain 状态：最近 5 次 run + 当前 cooldown + 下次 cron 模式。
   */
  studentStatus: adminProcedure
    .input(z.object({ studentId: z.string() }))
    .query(async ({ ctx, input }) => {
      // 1. 学生基本信息
      const student = await ctx.db.user.findUnique({
        where: { id: input.studentId },
        select: { id: true, nickname: true, username: true, role: true },
      });
      if (!student || student.role !== "STUDENT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }

      // 2. 最近 5 次 Brain run
      const recentLogs = await ctx.db.adminLog.findMany({
        where: { action: "brain-run", target: input.studentId },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const recentRuns = recentLogs.map((r) => {
        const d = parseBrainRunDetails(r.details);
        return {
          id: r.id,
          createdAt: r.createdAt,
          eventsProcessed: d.eventsProcessed ?? 0,
          agentsLaunched: d.agentsLaunched ?? [],
          skipped: d.skipped ?? [],
          durationMs: d.durationMs ?? 0,
        };
      });

      // 3. Progressive intervention cooldown (D55)
      const key = cooldownKey(input.studentId);
      const [cooldownRaw, cooldownTtl] = await Promise.all([
        redis.get(key),
        redis.ttl(key),
      ]);
      const cooldownValue = parseCooldownValue(cooldownRaw);
      const cooldownSeconds = cooldownTtl >= 0 ? cooldownTtl : null;

      // 4. Brain 每日 cron 配置（静态读）
      const brainSchedule = SCHEDULE_REGISTRY.find((s) => s.jobName === "learning-brain");

      return {
        student,
        recentRuns,
        cooldownSeconds,
        cooldownTier: cooldownValue?.tier ?? null,
        cooldownTierMaxHours: cooldownValue
          ? getCooldownTTL(cooldownValue.tier) / 3600
          : null,
        brainSchedule: brainSchedule
          ? {
              pattern: brainSchedule.pattern,
              description: brainSchedule.description,
              timezone: "UTC",
            }
          : null,
      };
    }),

  /**
   * Brain 最近 N 天聚合统计：总运行数、平均耗时、agent 分布、skipped Top 5。
   */
  stats: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }))
    .query(async ({ ctx, input }) => {
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - input.days);
      fromDate.setHours(0, 0, 0, 0);

      const logs = await ctx.db.adminLog.findMany({
        where: { action: "brain-run", createdAt: { gte: fromDate } },
        select: { details: true, createdAt: true },
      });

      let totalDurationMs = 0;
      let runsWithDuration = 0;
      const agentCount = new Map<string, number>();
      const skippedCount = new Map<string, number>();
      const studentsSeen = new Set<string>();

      for (const l of logs) {
        const d = parseBrainRunDetails(l.details);
        if (typeof d.durationMs === "number") {
          totalDurationMs += d.durationMs;
          runsWithDuration++;
        }
        if (d.studentId) studentsSeen.add(d.studentId);
        for (const a of d.agentsLaunched ?? []) {
          agentCount.set(a.jobName, (agentCount.get(a.jobName) ?? 0) + 1);
        }
        for (const s of d.skipped ?? []) {
          const key = `${s.jobName}: ${s.reason}`;
          skippedCount.set(key, (skippedCount.get(key) ?? 0) + 1);
        }
      }

      const agentDistribution = Array.from(agentCount.entries())
        .map(([agentName, count]) => ({ agentName, count }))
        .sort((a, b) => b.count - a.count);

      const topSkippedReasons = Array.from(skippedCount.entries())
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        days: input.days,
        totalRuns: logs.length,
        uniqueStudents: studentsSeen.size,
        avgDurationMs: runsWithDuration > 0 ? Math.round(totalDurationMs / runsWithDuration) : 0,
        agentDistribution,
        topSkippedReasons,
      };
    }),

  /**
   * Manually trigger Brain for a specific student (D56).
   * Enqueues a learning-brain job and logs the admin action.
   */
  triggerBrain: adminProcedure
    .input(z.object({ studentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify student exists
      const student = await ctx.db.user.findUnique({
        where: { id: input.studentId },
        select: { id: true, role: true },
      });
      if (!student || student.role !== "STUDENT") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });
      }

      const jobId = await enqueueLearningBrain({
        studentId: input.studentId,
        userId: ctx.session.userId,
        locale: ctx.session.locale ?? "zh",
      });

      await logAdminAction(
        ctx.db as unknown as PrismaClient,
        ctx.session.userId,
        "brain-manual-trigger",
        input.studentId,
        { studentId: input.studentId, jobId },
      );

      return { jobId };
    }),

  /**
   * Override (clear) intervention cooldown for a student (D56).
   * Deletes the Redis cooldown key and logs the admin action.
   */
  overrideCooldown: adminProcedure
    .input(z.object({ studentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const key = cooldownKey(input.studentId);
      const existed = await redis.del(key);

      await logAdminAction(
        ctx.db as unknown as PrismaClient,
        ctx.session.userId,
        "brain-cooldown-override",
        input.studentId,
        { studentId: input.studentId, keyExisted: existed > 0 },
      );

      return { cleared: existed > 0 };
    }),

  /**
   * Sprint 26 D62: real-time Brain run completion stream.
   *
   * Admin subscribes once; every `learning-brain` handler that commits an
   * AdminLog `brain-run` also publishes a `BrainRunEvent` to the global
   * `brain:runs` channel. Client dedupes by `logId` against paginated
   * `listRuns` results (D63).
   *
   * No input — admin monitor needs the global view; per-student subscriptions
   * would multiply open SSE connections for no added value.
   */
  onBrainRunComplete: adminProcedure
    .input(z.void())
    .subscription(async function* (opts) {
      const signal = opts.signal ?? AbortSignal.timeout(300_000); // 5 min max
      for await (const event of subscribeToBrainRun(signal)) {
        yield event satisfies BrainRunEvent;
      }
    }),
});
