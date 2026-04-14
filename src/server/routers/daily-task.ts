/**
 * Daily Task tRPC Router.
 *
 * Provides today's task pack for students and read access for parents/admins.
 * - STUDENT: read own tasks, mark complete
 * - PARENT: read child's tasks via family relation
 * - ADMIN: read any student's tasks
 *
 * See: docs/user-stories/intervention-daily-tasks.md (US-050)
 */
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { resolveStudentId } from "./shared/resolve-student-id";
import {
  todayTasksSchema,
  completeTaskSchema,
  taskHistorySchema,
} from "@/lib/domain/validations/daily-task";

// ─── Router ─────────────────────────────────────

export const dailyTaskRouter = router({
  /**
   * Get today's task pack for a student.
   * Includes all tasks with KP names, ordered by sortOrder.
   */
  todayTasks: protectedProcedure
    .input(todayTasksSchema)
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const pack = await ctx.db.dailyTaskPack.findUnique({
        where: {
          studentId_date: { studentId, date: today },
        },
        include: {
          tasks: {
            orderBy: { sortOrder: "asc" },
            include: {
              knowledgePoint: {
                select: { id: true, name: true, subject: true },
              },
              question: {
                select: { id: true, content: true },
              },
            },
          },
        },
      });

      return pack;
    }),

  /**
   * Mark a task as completed. Student only, owner-check.
   * Optimistic lock: task must be PENDING to complete.
   * Auto-completes pack when all tasks done.
   */
  completeTask: protectedProcedure
    .input(completeTaskSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "STUDENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Fetch task with pack to verify ownership
      const task = await ctx.db.dailyTask.findUnique({
        where: { id: input.taskId },
        include: {
          pack: { select: { id: true, studentId: true, totalTasks: true, completedTasks: true } },
        },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Owner check
      if (task.pack.studentId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Optimistic lock: must be PENDING
      if (task.status !== "PENDING") {
        return { alreadyCompleted: true };
      }

      const now = new Date();

      // Use interactive transaction with conditional update to avoid
      // double-increment when two requests race on the same task.
      const result = await ctx.db.$transaction(async (tx) => {
        const updated = await tx.dailyTask.updateMany({
          where: { id: input.taskId, status: "PENDING" },
          data: { status: "COMPLETED", completedAt: now },
        });

        // Another request already completed this task
        if (updated.count === 0) {
          return { alreadyCompleted: true, allDone: false };
        }

        const updatedPack = await tx.dailyTaskPack.update({
          where: { id: task.pack.id },
          data: { completedTasks: { increment: 1 } },
          select: { completedTasks: true, totalTasks: true },
        });

        const allDone = updatedPack.completedTasks >= updatedPack.totalTasks;
        if (allDone) {
          await tx.dailyTaskPack.update({
            where: { id: task.pack.id },
            data: { status: "COMPLETED" },
          });
        } else {
          await tx.dailyTaskPack.update({
            where: { id: task.pack.id },
            data: { status: "IN_PROGRESS" },
          });
        }

        return { alreadyCompleted: false, allDone };
      });

      return result;
    }),

  /**
   * Task history: last N days of pack summaries.
   */
  taskHistory: protectedProcedure
    .input(taskHistorySchema)
    .query(async ({ ctx, input }) => {
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        input.studentId,
      );

      const since = new Date();
      since.setDate(since.getDate() - input.limit);
      since.setHours(0, 0, 0, 0);

      const packs = await ctx.db.dailyTaskPack.findMany({
        where: {
          studentId,
          date: { gte: since },
        },
        orderBy: { date: "desc" },
        select: {
          id: true,
          date: true,
          status: true,
          totalTasks: true,
          completedTasks: true,
        },
      });

      return packs;
    }),
});
