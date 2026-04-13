/**
 * Student Mastery tRPC Router.
 *
 * Provides mastery state data for students and parents.
 * - STUDENT: sees own data only
 * - PARENT: can view children via family relation verification
 *
 * See: docs/user-stories/diagnosis-mastery.md (US-036)
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, studentProcedure } from "../trpc";
import type { Context } from "../trpc";
import type { PrismaClient } from "@prisma/client";
import { StudentMemoryImpl } from "@/lib/domain/memory";
import { mapQuality } from "@/lib/domain/spaced-repetition";

// ─── Permission Helper ─────────────────────────

/**
 * Resolve the target student ID.
 * - If input.studentId is the requester: direct access.
 * - If input.studentId differs: verify parent-student family relation.
 * - If no input.studentId: default to requester (student viewing own).
 */
async function resolveStudentId(
  db: Context["db"],
  requesterId: string,
  inputStudentId?: string,
): Promise<string> {
  const studentId = inputStudentId ?? requesterId;

  if (studentId === requesterId) return studentId;

  // Verify parent-student relation through family
  const parentFamilies = await db.familyMember.findMany({
    where: { userId: requesterId },
    select: { familyId: true },
  });
  const familyIds = parentFamilies.map((f) => f.familyId);
  if (familyIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const studentInFamily = await db.familyMember.findFirst({
    where: { userId: studentId, familyId: { in: familyIds } },
  });
  if (!studentInFamily) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return studentId;
}

// ─── Router ─────────────────────────────────────

export const masteryRouter = router({
  /**
   * List mastery states with optional filters.
   * Supports subject, status, and cursor-based pagination.
   */
  list: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        subject: z.string().optional(),
        status: z.enum(["NEW_ERROR", "CORRECTED", "REVIEWING", "MASTERED", "REGRESSED"]).optional(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        input.studentId,
      );

      const where: Record<string, unknown> = { studentId };
      if (input.status) where.status = input.status;
      if (input.subject) {
        where.knowledgePoint = { subject: input.subject, deletedAt: null };
      }

      const [items, total] = await Promise.all([
        ctx.db.masteryState.findMany({
          where,
          skip: (input.page - 1) * input.limit,
          take: input.limit,
          orderBy: { updatedAt: "desc" },
          include: {
            knowledgePoint: {
              select: {
                id: true,
                name: true,
                subject: true,
                grade: true,
                difficulty: true,
                parent: { select: { name: true } },
              },
            },
          },
        }),
        ctx.db.masteryState.count({ where }),
      ]);

      // Fetch review schedules for these items in bulk
      const kpIds = items.map((i) => i.knowledgePointId);
      const schedules = kpIds.length > 0
        ? await ctx.db.reviewSchedule.findMany({
            where: { studentId, knowledgePointId: { in: kpIds } },
            select: { knowledgePointId: true, nextReviewAt: true },
          })
        : [];
      const scheduleMap = new Map(
        schedules.map((s) => [s.knowledgePointId, s.nextReviewAt]),
      );

      return {
        items: items.map((item) => ({
          id: item.id,
          knowledgePointId: item.knowledgePointId,
          knowledgePointName: item.knowledgePoint.name,
          subject: item.knowledgePoint.subject,
          grade: item.knowledgePoint.grade,
          difficulty: item.knowledgePoint.difficulty,
          parentName: item.knowledgePoint.parent?.name ?? null,
          status: item.status,
          totalAttempts: item.totalAttempts,
          correctAttempts: item.correctAttempts,
          lastAttemptAt: item.lastAttemptAt,
          masteredAt: item.masteredAt,
          nextReviewAt: scheduleMap.get(item.knowledgePointId) ?? null,
        })),
        total,
        page: input.page,
        totalPages: Math.ceil(total / input.limit),
      };
    }),

  /**
   * Single knowledge point mastery detail.
   * Returns MasteryState + InterventionHistory + linked ErrorQuestions.
   */
  detail: protectedProcedure
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
        input.studentId,
      );

      const mastery = await ctx.db.masteryState.findUnique({
        where: {
          studentId_knowledgePointId: {
            studentId,
            knowledgePointId: input.knowledgePointId,
          },
        },
        include: {
          knowledgePoint: {
            select: {
              id: true,
              name: true,
              description: true,
              subject: true,
              grade: true,
              difficulty: true,
              importance: true,
            },
          },
        },
      });

      if (!mastery) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Intervention history
      const interventions = await ctx.db.interventionHistory.findMany({
        where: {
          studentId,
          knowledgePointId: input.knowledgePointId,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      });

      // Linked error questions via QuestionKnowledgeMapping
      const errorQuestions = await ctx.db.errorQuestion.findMany({
        where: {
          studentId,
          deletedAt: null,
          knowledgeMappings: {
            some: { knowledgePointId: input.knowledgePointId },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          content: true,
          studentAnswer: true,
          correctAnswer: true,
          subject: true,
          createdAt: true,
        },
      });

      return {
        mastery: {
          id: mastery.id,
          status: mastery.status,
          totalAttempts: mastery.totalAttempts,
          correctAttempts: mastery.correctAttempts,
          lastAttemptAt: mastery.lastAttemptAt,
          masteredAt: mastery.masteredAt,
        },
        knowledgePoint: mastery.knowledgePoint,
        interventions: interventions.map((i) => ({
          id: i.id,
          type: i.type,
          content: i.content,
          agentId: i.agentId,
          createdAt: i.createdAt,
        })),
        errorQuestions,
      };
    }),

  /**
   * Weak knowledge points (status = NEW_ERROR, CORRECTED, or REGRESSED).
   */
  weakPoints: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        subject: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        input.studentId,
      );

      const weakStatuses = ["NEW_ERROR", "CORRECTED", "REGRESSED"];
      const where: Record<string, unknown> = {
        studentId,
        status: { in: weakStatuses },
      };
      if (input.subject) {
        where.knowledgePoint = { subject: input.subject, deletedAt: null };
      }

      const items = await ctx.db.masteryState.findMany({
        where,
        take: input.limit,
        orderBy: { updatedAt: "desc" },
        include: {
          knowledgePoint: {
            select: {
              id: true,
              name: true,
              subject: true,
              difficulty: true,
            },
          },
        },
      });

      return items.map((item) => ({
        id: item.id,
        knowledgePointId: item.knowledgePointId,
        knowledgePointName: item.knowledgePoint.name,
        subject: item.knowledgePoint.subject,
        difficulty: item.knowledgePoint.difficulty,
        status: item.status,
        totalAttempts: item.totalAttempts,
        correctAttempts: item.correctAttempts,
        lastAttemptAt: item.lastAttemptAt,
      }));
    }),

  /**
   * Mastery statistics: counts grouped by status and subject.
   */
  stats: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        input.studentId,
      );

      // Group by status
      const byStatus = await ctx.db.masteryState.groupBy({
        by: ["status"],
        where: { studentId },
        _count: true,
      });

      // Group by subject (via knowledge point join — use raw count query)
      const bySubject = await ctx.db.$queryRaw<
        Array<{ subject: string; count: bigint }>
      >`
        SELECT kp.subject, COUNT(ms.id)::bigint as count
        FROM "MasteryState" ms
        JOIN "KnowledgePoint" kp ON kp.id = ms."knowledgePointId"
        WHERE ms."studentId" = ${studentId}
          AND kp."deletedAt" IS NULL
        GROUP BY kp.subject
        ORDER BY count DESC
      `;

      return {
        byStatus: byStatus.map((s) => ({
          status: s.status,
          count: s._count,
        })),
        bySubject: bySubject.map((s) => ({
          subject: s.subject,
          count: Number(s.count),
        })),
        total: byStatus.reduce((sum, s) => sum + s._count, 0),
      };
    }),

  /**
   * Today's reviews: overdue review items for a student.
   */
  todayReviews: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        input.studentId,
      );

      const memory = new StudentMemoryImpl(ctx.db as unknown as PrismaClient);
      const overdueSchedules = await memory.getOverdueReviews(studentId);

      if (overdueSchedules.length === 0) {
        return { items: [], count: 0 };
      }

      // Fetch KnowledgePoint details for display
      const kpIds = overdueSchedules.map((s) => s.knowledgePointId);
      const knowledgePoints = await ctx.db.knowledgePoint.findMany({
        where: { id: { in: kpIds }, deletedAt: null },
        select: { id: true, name: true, subject: true, grade: true },
      });
      const kpMap = new Map(knowledgePoints.map((kp) => [kp.id, kp]));

      const items: Array<{
        knowledgePointId: string;
        knowledgePointName: string;
        subject: string;
        grade: string | null;
        nextReviewAt: Date;
        intervalDays: number;
        consecutiveCorrect: number;
      }> = [];

      for (const s of overdueSchedules) {
        const kp = kpMap.get(s.knowledgePointId);
        if (!kp) {
          ctx.log.warn({ knowledgePointId: s.knowledgePointId, studentId }, "KnowledgePoint not found for review");
          continue;
        }
        items.push({
          knowledgePointId: s.knowledgePointId,
          knowledgePointName: kp.name,
          subject: kp.subject,
          grade: kp.grade,
          nextReviewAt: s.nextReviewAt,
          intervalDays: s.intervalDays,
          consecutiveCorrect: s.consecutiveCorrect,
        });
      }

      return { items, count: items.length };
    }),

  /**
   * Submit a review result. STUDENT only.
   */
  submitReview: studentProcedure
    .input(
      z.object({
        knowledgePointId: z.string(),
        isCorrect: z.boolean(),
        selfRatedDifficulty: z.number().int().min(1).max(5),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const studentId = ctx.session.userId;

      // Map to SM-2 quality
      const quality = mapQuality(input.isCorrect, input.selfRatedDifficulty);

      const memory = new StudentMemoryImpl(ctx.db as unknown as PrismaClient);
      const result = await memory.processReviewResult(
        studentId,
        input.knowledgePointId,
        quality,
      );

      return {
        mastery: {
          status: result.mastery.status,
          totalAttempts: result.mastery.totalAttempts,
          correctAttempts: result.mastery.correctAttempts,
          masteredAt: result.mastery.masteredAt,
        },
        nextReviewAt: result.schedule.nextReviewAt,
        transition: result.transition
          ? `${result.transition.from} → ${result.transition.to}`
          : null,
      };
    }),

  /**
   * Review detail: KP info + linked error questions for review material.
   */
  reviewDetail: protectedProcedure
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
        input.studentId,
      );

      const mastery = await ctx.db.masteryState.findUnique({
        where: {
          studentId_knowledgePointId: {
            studentId,
            knowledgePointId: input.knowledgePointId,
          },
        },
        include: {
          knowledgePoint: {
            select: {
              id: true,
              name: true,
              description: true,
              subject: true,
              grade: true,
              difficulty: true,
            },
          },
        },
      });

      if (!mastery) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Review schedule
      const schedule = await ctx.db.reviewSchedule.findUnique({
        where: {
          studentId_knowledgePointId: {
            studentId,
            knowledgePointId: input.knowledgePointId,
          },
        },
      });

      // Linked error questions as review material
      const errorQuestions = await ctx.db.errorQuestion.findMany({
        where: {
          studentId,
          deletedAt: null,
          knowledgeMappings: {
            some: { knowledgePointId: input.knowledgePointId },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          content: true,
          studentAnswer: true,
          correctAnswer: true,
          subject: true,
          createdAt: true,
        },
      });

      return {
        mastery: {
          status: mastery.status,
          totalAttempts: mastery.totalAttempts,
          correctAttempts: mastery.correctAttempts,
        },
        knowledgePoint: mastery.knowledgePoint,
        schedule: schedule
          ? {
              nextReviewAt: schedule.nextReviewAt,
              intervalDays: schedule.intervalDays,
              consecutiveCorrect: schedule.consecutiveCorrect,
            }
          : null,
        errorQuestions,
      };
    }),
});
