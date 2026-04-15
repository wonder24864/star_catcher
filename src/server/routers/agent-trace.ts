/**
 * Agent Trace tRPC Router.
 *
 * Admin: full trace list/detail/stats.
 * Parent/Student: simplified latest trace lookups for summary views.
 *
 * See: docs/user-stories/agent-trace-views.md (US-042, US-043)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { resolveStudentId } from "./shared/resolve-student-id";
import { buildJaegerUrl } from "@/lib/infra/telemetry/jaeger-url";

// ─── Router ─────────────────────────────────────

export const agentTraceRouter = router({
  /**
   * List traces with filters (ADMIN only).
   */
  list: adminProcedure
    .input(
      z.object({
        agentName: z.string().optional(),
        status: z.enum(["RUNNING", "COMPLETED", "TERMINATED", "FAILED"]).optional(),
        userId: z.string().optional(),
        dateFrom: z.date().optional(),
        dateTo: z.date().optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = {};
      if (input.agentName) where.agentName = input.agentName;
      if (input.status) where.status = input.status;
      if (input.userId) where.userId = input.userId;
      if (input.dateFrom || input.dateTo) {
        where.createdAt = {
          ...(input.dateFrom && { gte: input.dateFrom }),
          ...(input.dateTo && { lte: input.dateTo }),
        };
      }

      const [rawTraces, total] = await Promise.all([
        ctx.db.agentTrace.findMany({
          where,
          include: {
            user: { select: { id: true, nickname: true, username: true } },
          },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
        ctx.db.agentTrace.count({ where }),
      ]);

      // Sprint 15: 后端构造 Jaeger URL，前端零感知
      const traces = rawTraces.map((t) => ({
        ...t,
        jaegerUrl: buildJaegerUrl(t.otelTraceId),
      }));

      return { traces, total, page: input.page, limit: input.limit };
    }),

  /**
   * Single trace detail with all steps (ADMIN only).
   */
  detail: adminProcedure
    .input(z.object({ traceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const trace = await ctx.db.agentTrace.findUnique({
        where: { id: input.traceId },
        include: {
          user: { select: { id: true, nickname: true, username: true } },
          steps: { orderBy: { stepNo: "asc" } },
        },
      });

      if (!trace) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Trace not found" });
      }

      return {
        ...trace,
        jaegerUrl: buildJaegerUrl(trace.otelTraceId), // Sprint 15
      };
    }),

  /**
   * Agent stats for the last 7 days (ADMIN only).
   */
  stats: adminProcedure.query(async ({ ctx }) => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const traces = await ctx.db.agentTrace.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: {
        agentName: true,
        status: true,
        totalDurationMs: true,
        totalInputTokens: true,
        totalOutputTokens: true,
      },
    });

    // Group by agentName
    const grouped = new Map<
      string,
      { total: number; completed: number; totalDuration: number; totalTokens: number }
    >();

    for (const t of traces) {
      const entry = grouped.get(t.agentName) ?? {
        total: 0,
        completed: 0,
        totalDuration: 0,
        totalTokens: 0,
      };
      entry.total += 1;
      if (t.status === "COMPLETED") entry.completed += 1;
      entry.totalDuration += t.totalDurationMs;
      entry.totalTokens += t.totalInputTokens + t.totalOutputTokens;
      grouped.set(t.agentName, entry);
    }

    const byAgent = Array.from(grouped.entries()).map(([agentName, data]) => ({
      agentName,
      totalCalls: data.total,
      successRate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
      avgDurationMs: data.total > 0 ? Math.round(data.totalDuration / data.total) : 0,
      avgTokens: data.total > 0 ? Math.round(data.totalTokens / data.total) : 0,
    }));

    return { byAgent, totalTraces: traces.length };
  }),

  /**
   * Latest completed trace for a specific error question (Parent/Student).
   * Used by AgentSummaryCard on error question detail page.
   */
  latestForQuestion: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        errorQuestionId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );

      // Find the latest diagnosis trace for this student.
      // The diagnosis handler uses the homework sessionId in AgentTrace.sessionId,
      // and there's no direct FK from AgentTrace to ErrorQuestion.
      // We match via InterventionHistory: find DIAGNOSIS interventions that reference
      // this errorQuestionId in their content JSON, then find the closest AgentTrace.
      const intervention = await ctx.db.interventionHistory.findFirst({
        where: {
          studentId,
          type: "DIAGNOSIS",
          content: { path: ["errorQuestionId"], equals: input.errorQuestionId },
        },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });

      if (!intervention) return null;

      // Find the diagnosis trace closest to this intervention's time
      const trace = await ctx.db.agentTrace.findFirst({
        where: {
          userId: studentId,
          agentName: "diagnosis",
          createdAt: { lte: intervention.createdAt },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          summary: true,
          totalSteps: true,
          totalDurationMs: true,
          createdAt: true,
        },
      });

      return trace;
    }),

  /**
   * Latest completed trace for a knowledge point (Parent/Student).
   * Used by AgentSummaryCard on mastery map detail.
   */
  latestForKnowledgePoint: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        knowledgePointId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );

      // Find the latest trace that involved this KP
      // We look for diagnosis traces for this student, ordered by recency
      const traces = await ctx.db.agentTrace.findMany({
        where: {
          userId: studentId,
          agentName: "diagnosis",
          status: { in: ["COMPLETED", "RUNNING"] },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          summary: true,
          totalSteps: true,
          totalDurationMs: true,
          createdAt: true,
        },
      });

      // Return the most recent one (summary text may reference the KP)
      return traces[0] ?? null;
    }),
});
