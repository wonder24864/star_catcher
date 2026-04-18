/**
 * Error Question Router
 * US-020: Browse error question list (filter, search, pagination)
 * US-021: Error question detail
 * US-022: Parent notes
 */
import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc";
import { TRPCError } from "@trpc/server";
import type { Context } from "@/server/trpc";
import { enqueueGenerateExplanation } from "@/lib/infra/queue";
import { createTaskRun, attachBullJobId } from "@/lib/task-runner";

const PAGE_SIZE = 20;

const SubjectEnum = z.enum([
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
]);

const ContentTypeEnum = z.enum([
  "HOMEWORK", "EXERCISE", "DICTATION", "COPY", "ORAL", "OTHER",
]);

async function verifyStudentAccess(
  db: Context["db"],
  requesterId: string,
  requesterRole: string,
  studentId: string
): Promise<void> {
  if (requesterRole === "STUDENT") {
    if (requesterId !== studentId) throw new TRPCError({ code: "FORBIDDEN" });
    return;
  }
  if (requesterRole === "PARENT") {
    const parentFamilies = await db.familyMember.findMany({ where: { userId: requesterId } });
    const familyIds = (parentFamilies as { familyId: string }[]).map((m) => m.familyId);
    if (familyIds.length === 0) throw new TRPCError({ code: "FORBIDDEN" });
    const studentInFamily = await db.familyMember.findFirst({
      where: { userId: studentId, familyId: { in: familyIds } },
    });
    if (!studentInFamily) throw new TRPCError({ code: "FORBIDDEN" });
    return;
  }
  throw new TRPCError({ code: "FORBIDDEN" });
}

export const errorRouter = router({
  /**
   * List error questions with filters + pagination.
   * STUDENT: only own questions (studentId ignored).
   * PARENT: must specify studentId of a family member.
   */
  list: protectedProcedure
    .input(
      z.object({
        studentId: z.string().optional(),
        subject: SubjectEnum.optional(),
        contentType: ContentTypeEnum.optional(),
        dateFrom: z.string().optional(), // YYYY-MM-DD
        dateTo: z.string().optional(),   // YYYY-MM-DD
        search: z.string().optional(),
        page: z.number().int().min(1).default(1),
      })
    )
    .query(async ({ ctx, input }) => {
      const { userId, role } = ctx.session!;

      let targetStudentId: string;

      if (role === "STUDENT") {
        targetStudentId = userId;
      } else if (role === "PARENT") {
        if (!input.studentId) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "studentId required for PARENT" });
        }
        await verifyStudentAccess(ctx.db, userId, role, input.studentId);
        targetStudentId = input.studentId;
      } else {
        throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
      }

      const where: Record<string, unknown> = {
        studentId: targetStudentId,
        deletedAt: null,
      };

      if (input.subject) where.subject = input.subject;
      if (input.contentType) where.contentType = input.contentType;
      if (input.search) where.content = { contains: input.search };

      if (input.dateFrom || input.dateTo) {
        const createdAt: Record<string, Date> = {};
        if (input.dateFrom) createdAt.gte = new Date(`${input.dateFrom}T00:00:00.000Z`);
        if (input.dateTo) createdAt.lte = new Date(`${input.dateTo}T23:59:59.999Z`);
        where.createdAt = createdAt;
      }

      const [total, items] = await Promise.all([
        ctx.db.errorQuestion.count({ where }),
        ctx.db.errorQuestion.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          // Include the originating homework session so the frontend can
          // group errors by "作业会话" (see US-020 grouped view). A small
          // projection keeps the payload lean; manual errors without a
          // SessionQuestion link will have homeworkSession === null.
          include: {
            sessionQuestion: {
              select: {
                homeworkSession: {
                  select: {
                    id: true,
                    title: true,
                    subject: true,
                    finalScore: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        }),
      ]);

      // Flatten: pull homeworkSession up to the top level as `session` so
      // consumers don't need to reach through `sessionQuestion`.
      const flattened = items.map((eq) => {
        const { sessionQuestion, ...rest } = eq as typeof eq & {
          sessionQuestion: {
            homeworkSession: {
              id: string;
              title: string | null;
              subject: string | null;
              finalScore: number | null;
              createdAt: Date;
            } | null;
          } | null;
        };
        return {
          ...rest,
          session: sessionQuestion?.homeworkSession ?? null,
        };
      });

      return {
        items: flattened,
        total,
        page: input.page,
        pageSize: PAGE_SIZE,
        totalPages: Math.ceil(total / PAGE_SIZE),
      };
    }),

  /**
   * Detail view: error question + parentNotes (with author info).
   * Accessible by the owning student or any family parent.
   */
  detail: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { userId, role } = ctx.session!;

      const eq = await ctx.db.errorQuestion.findUnique({
        where: { id: input.id },
        include: {
          parentNotes: { include: { parent: true }, orderBy: { createdAt: "asc" } },
          // For the image-crop view: we need the source HomeworkImage.id +
          // the SessionQuestion.imageRegion percentages.
          sessionQuestion: {
            select: {
              imageRegion: true,
              homeworkSession: {
                select: {
                  images: {
                    orderBy: { sortOrder: "asc" },
                    take: 1,
                    select: { id: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!eq) throw new TRPCError({ code: "NOT_FOUND" });

      await verifyStudentAccess(ctx.db, userId, role, (eq as { studentId: string }).studentId);

      return eq;
    }),

  /**
   * Request AI-generated explanation for an error question. PARENT only
   * (student side intentionally can't trigger this — see ADR-013). Idempotent:
   * if ErrorQuestion.explanation is already cached, the mutation still creates
   * a TaskRun but the worker short-circuits via a cache hit and completes
   * immediately. Returns { taskId, taskKey } so the client can lock its button
   * via useStartTask.
   */
  requestExplanation: protectedProcedure
    .input(z.object({ errorQuestionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session!.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { userId, locale } = ctx.session!;

      const eq = await ctx.db.errorQuestion.findUnique({
        where: { id: input.errorQuestionId },
        select: { id: true, studentId: true, deletedAt: true },
      });
      if (!eq || eq.deletedAt) throw new TRPCError({ code: "NOT_FOUND" });
      await verifyStudentAccess(ctx.db, userId, "PARENT", eq.studentId);

      const taskKey = `explanation:${input.errorQuestionId}`;
      const { task: taskRun, isNew } = await createTaskRun(ctx.db, {
        type: "EXPLANATION",
        key: taskKey,
        userId,
        studentId: eq.studentId,
      });

      let jobId = taskRun.bullJobId ?? null;
      if (isNew) {
        jobId = await enqueueGenerateExplanation({
          errorQuestionId: input.errorQuestionId,
          userId,
          studentId: eq.studentId,
          locale: locale ?? "zh",
          taskId: taskRun.id,
        });
        await attachBullJobId(ctx.db, taskRun.id, jobId);
      }

      return { jobId, taskId: taskRun.id, taskKey };
    }),

  /**
   * Parent adds a note (max 500 chars). PARENT only.
   */
  addNote: protectedProcedure
    .input(z.object({
      errorQuestionId: z.string(),
      content: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session!.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { userId } = ctx.session!;

      // Verify the parent has access to this student's data
      const eq = await ctx.db.errorQuestion.findUnique({ where: { id: input.errorQuestionId } });
      if (!eq) throw new TRPCError({ code: "NOT_FOUND" });
      await verifyStudentAccess(ctx.db, userId, "PARENT", (eq as { studentId: string }).studentId);

      const note = await ctx.db.parentNote.create({
        data: {
          parentId: userId,
          errorQuestionId: input.errorQuestionId,
          content: input.content,
        },
        include: { parent: true },
      });
      return note;
    }),

  /**
   * Parent edits own note.
   */
  editNote: protectedProcedure
    .input(z.object({
      noteId: z.string(),
      content: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session!.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { userId } = ctx.session!;

      const note = await ctx.db.parentNote.findUnique({ where: { id: input.noteId } });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      if ((note as { parentId: string }).parentId !== userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return ctx.db.parentNote.update({
        where: { id: input.noteId },
        data: { content: input.content },
      });
    }),

  /**
   * Parent deletes own note.
   */
  deleteNote: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session!.role !== "PARENT") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { userId } = ctx.session!;

      const note = await ctx.db.parentNote.findUnique({ where: { id: input.noteId } });
      if (!note) throw new TRPCError({ code: "NOT_FOUND" });
      if ((note as { parentId: string }).parentId !== userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db.parentNote.delete({ where: { id: input.noteId } });
      return { success: true };
    }),
});
