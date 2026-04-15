/**
 * Daily Task tRPC Router.
 *
 * Provides today's task pack for students and read access for parents/admins.
 * - STUDENT: read own tasks, mark complete, start tasks, submit practice answers
 * - PARENT: read child's tasks via family relation
 * - ADMIN: read any student's tasks
 *
 * See: docs/user-stories/intervention-daily-tasks.md (US-050)
 *      docs/user-stories/similar-questions-explanation.md (US-051, US-052)
 */
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { router, protectedProcedure } from "../trpc";
import { resolveStudentId } from "./shared/resolve-student-id";
import {
  todayTasksSchema,
  completeTaskSchema,
  taskHistorySchema,
  startTaskSchema,
  submitPracticeAnswerSchema,
} from "@/lib/domain/validations/daily-task";
import { findSimilarQuestions } from "@/lib/domain/similar-questions/find";
import { generateExplanation } from "@/lib/domain/ai/operations/generate-explanation";
import { gradeAnswer } from "@/lib/domain/ai/operations/grade-answer";
import { completeDailyTaskInTx } from "@/lib/domain/daily-task/complete";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import { enqueueMasteryEvaluation } from "@/lib/infra/queue";
import { createLogger } from "@/lib/infra/logger";
import type { ExplanationCard } from "@/lib/domain/ai/harness/schemas/generate-explanation";

const log = createLogger("router:daily-task");

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
   * Open a task and load its runtime payload.
   *
   * - REVIEW       → returns {task, originalQuestion}
   * - PRACTICE     → returns {task, originalQuestion, similarQuestions}
   * - EXPLANATION  → returns {task, explanationCard}, lazy-cached into
   *                  task.content.explanationCard so subsequent calls skip AI.
   *
   * RBAC: STUDENT (owner only), PARENT (linked child), ADMIN (any).
   */
  startTask: protectedProcedure
    .input(startTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.dailyTask.findUnique({
        where: { id: input.taskId },
        include: {
          pack: { select: { studentId: true } },
          knowledgePoint: { select: { id: true, name: true, subject: true } },
          question: {
            select: {
              id: true,
              content: true,
              correctAnswer: true,
              studentAnswer: true,
              subject: true,
              grade: true,
            },
          },
        },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      // Owner / RBAC check
      const studentId = await resolveStudentId(
        ctx.db,
        ctx.session.userId,
        ctx.session.role,
        task.pack.studentId,
      );
      if (studentId !== task.pack.studentId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const baseTask = {
        id: task.id,
        type: task.type,
        status: task.status,
        knowledgePoint: task.knowledgePoint,
        question: task.question
          ? { id: task.question.id, content: task.question.content }
          : null,
        content: task.content as Record<string, unknown> | null,
      };

      if (task.type === "REVIEW") {
        return { task: baseTask, originalQuestion: task.question };
      }

      // Fallback source question for PRACTICE/EXPLANATION: the Intervention
      // Agent prompt only fills questionId on REVIEW tasks (prompt says
      // "existing error question ID (REVIEW only, optional)"). For the other
      // two types we look up the most recent error question this student has
      // under the same KP. If none exists, we degrade further:
      //   PRACTICE: KP-only similar-question retrieval (no originalQuestion)
      //   EXPLANATION: generic KP-level conceptual card
      // At this point task.type is PRACTICE | EXPLANATION (REVIEW returned above).
      let sourceQuestion = task.question;
      if (!sourceQuestion) {
        const fallback = await ctx.db.errorQuestion.findFirst({
          where: {
            studentId: task.pack.studentId,
            deletedAt: null,
            knowledgeMappings: {
              some: { knowledgePointId: task.knowledgePointId },
            },
          },
          select: {
            id: true,
            content: true,
            correctAnswer: true,
            studentAnswer: true,
            subject: true,
            grade: true,
          },
          orderBy: { createdAt: "desc" },
        });
        sourceQuestion = fallback ?? null;
      }

      if (task.type === "PRACTICE") {
        const similar = await findSimilarQuestions(
          ctx.db as unknown as PrismaClient,
          {
            errorQuestionId: sourceQuestion?.id ?? null,
            knowledgePointId: task.knowledgePointId,
            limit: 5,
          },
        );
        return {
          task: baseTask,
          originalQuestion: sourceQuestion
            ? { id: sourceQuestion.id, content: sourceQuestion.content }
            : null,
          similarQuestions: similar,
        };
      }

      if (task.type === "EXPLANATION") {
        // Lazy cache check
        const existingContent = (task.content as Record<string, unknown> | null) ?? {};
        const cached = existingContent.explanationCard as
          | ExplanationCard
          | undefined;
        if (cached && cached.format && cached.steps?.length) {
          return { task: baseTask, explanationCard: cached };
        }

        const result = await generateExplanation({
          questionContent: sourceQuestion?.content ?? "",
          correctAnswer: sourceQuestion?.correctAnswer,
          studentAnswer: sourceQuestion?.studentAnswer,
          kpName: task.knowledgePoint.name,
          subject: sourceQuestion?.subject ?? undefined,
          grade: sourceQuestion?.grade ?? undefined,
          format: "auto",
          locale: ctx.session.locale,
          context: {
            userId: ctx.session.userId,
            locale: ctx.session.locale,
            grade: sourceQuestion?.grade ?? undefined,
            correlationId: `start-task-${input.taskId}`,
          },
        });

        if (!result.success || !result.data) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: result.error?.message ?? "Failed to generate explanation",
          });
        }

        // Lazy cache into DailyTask.content
        const newContent = {
          ...existingContent,
          explanationCard: result.data,
        };
        await ctx.db.dailyTask.update({
          where: { id: input.taskId },
          data: { content: newContent as never },
        });

        return { task: baseTask, explanationCard: result.data };
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Unknown task type: ${task.type as string}`,
      });
    }),

  /**
   * Submit an answer to a similar (PRACTICE) question.
   *
   * - AI grades the answer (GRADE_ANSWER operation)
   * - MasteryState attempt counters incremented (StudentMemory.recordPracticeAttempt)
   * - DailyTask marked COMPLETED via shared transactional helper
   *
   * Note: regardless of correctness, the task is considered done — one
   * practice attempt fulfills the task. Mastery progression is captured in
   * the attempt counters and InterventionHistory.
   */
  submitPracticeAnswer: protectedProcedure
    .input(submitPracticeAnswerSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "STUDENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const studentId = ctx.session.userId;

      const task = await ctx.db.dailyTask.findUnique({
        where: { id: input.taskId },
        include: {
          pack: { select: { studentId: true } },
          question: { select: { id: true } },
        },
      });

      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (task.pack.studentId !== studentId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (task.type !== "PRACTICE") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "submitPracticeAnswer is only valid for PRACTICE tasks",
        });
      }

      // Validate selectedQuestionId is a legitimate similar question:
      // must (a) reference the same knowledge point as the task, (b) not be
      // the task's source question itself (if the task has one — Intervention
      // Agent may omit questionId on PRACTICE tasks), (c) exist and not be
      // soft-deleted.
      // We don't require it to be in the current top-N candidates — new
      // errors may have pushed the student's original choice out of the
      // top-N between startTask and submitPracticeAnswer.
      if (task.question && input.selectedQuestionId === task.question.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected question must differ from the source question",
        });
      }

      const selectedFull = await ctx.db.errorQuestion.findFirst({
        where: {
          id: input.selectedQuestionId,
          deletedAt: null,
          knowledgeMappings: {
            some: { knowledgePointId: task.knowledgePointId },
          },
        },
        select: {
          id: true,
          content: true,
          correctAnswer: true,
          subject: true,
          grade: true,
        },
      });
      if (!selectedFull) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Selected question is not a similar-question candidate for this task",
        });
      }

      const grading = await gradeAnswer({
        questionContent: selectedFull.content,
        studentAnswer: input.studentAnswer,
        correctAnswer: selectedFull.correctAnswer ?? null,
        subject: selectedFull.subject ?? undefined,
        grade: selectedFull.grade ?? undefined,
        context: {
          userId: studentId,
          locale: ctx.session.locale,
          grade: selectedFull.grade ?? undefined,
          correlationId: `practice-${input.taskId}`,
        },
      });

      const isCorrect = grading.success ? grading.data?.isCorrect ?? false : false;
      const needsReview = !grading.success;

      // Update MasteryState via Memory layer (Rule 6 / 9)
      const memory = new StudentMemoryImpl(ctx.db as unknown as PrismaClient);
      const masteryAfter = await memory.recordPracticeAttempt(
        studentId,
        task.knowledgePointId,
        isCorrect,
        {
          dailyTaskId: input.taskId,
          selectedQuestionId: input.selectedQuestionId,
          aiGraded: grading.success,
        },
      );

      // Complete the DailyTask + bump pack
      const completeResult = await ctx.db.$transaction((tx) =>
        completeDailyTaskInTx(tx, {
          taskId: input.taskId,
          expectedStudentId: studentId,
        }),
      );

      // Trigger mastery-evaluation Agent ONLY for REVIEWING state.
      // Earlier states (NEW_ERROR/CORRECTED) are handled by Memory-level
      // auto-transitions; later states (MASTERED/REGRESSED) don't need
      // re-evaluation. REVIEW tasks go through mastery.submitReview and stay
      // on the pure SM-2 path (US-040); EXPLANATION tasks don't update state.
      // See: docs/user-stories/mastery-evaluation.md (US-053)
      if (masteryAfter.status === "REVIEWING") {
        try {
          // Resolve reviewScheduleId; bootstrap a 1-day schedule if missing
          // (e.g. PRACTICE on a freshly-promoted KP with no prior REVIEW).
          const existing = await ctx.db.reviewSchedule.findUnique({
            where: {
              studentId_knowledgePointId: {
                studentId,
                knowledgePointId: task.knowledgePointId,
              },
            },
            select: { id: true },
          });
          const reviewScheduleId =
            existing?.id ??
            (await memory.scheduleReview(studentId, task.knowledgePointId, 1)).id;

          await enqueueMasteryEvaluation({
            studentId,
            knowledgePointId: task.knowledgePointId,
            reviewScheduleId,
            userId: studentId,
            locale: ctx.session.locale ?? "zh-CN",
          });
        } catch (err) {
          log.warn(
            { err, studentId, knowledgePointId: task.knowledgePointId },
            "enqueueMasteryEvaluation failed (non-blocking; Brain will retry)",
          );
        }
      }

      return {
        correct: isCorrect,
        needsReview,
        correctAnswer: selectedFull.correctAnswer,
        masteryStatus: masteryAfter.status,
        alreadyCompleted: completeResult.alreadyCompleted,
        allDone: completeResult.allDone,
      };
    }),

  /**
   * Mark a task as completed (REVIEW / EXPLANATION manual flow).
   * Optimistic lock: task must be PENDING to complete.
   * Auto-completes pack when all tasks done.
   */
  completeTask: protectedProcedure
    .input(completeTaskSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.role !== "STUDENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const studentId = ctx.session.userId;

      const result = await ctx.db.$transaction((tx) =>
        completeDailyTaskInTx(tx, { taskId: input.taskId, expectedStudentId: studentId }),
      );

      if (result.notFound) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      if (result.ownerMismatch) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return {
        alreadyCompleted: result.alreadyCompleted,
        allDone: result.allDone,
      };
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
