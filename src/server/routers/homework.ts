import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, type Context } from "../trpc";
import { deleteObject } from "@/lib/storage";
import {
  createSessionSchema,
  getSessionSchema,
  listSessionsSchema,
  updateImageOrderSchema,
  deleteSessionSchema,
  updateQuestionSchema,
  deleteQuestionSchema,
  addQuestionSchema,
  confirmResultsSchema,
} from "@/lib/validations/homework";

/** Verify the caller owns or is the student of a session. Returns the session. */
async function verifySessionAccess(
  db: Context["db"],
  sessionId: string,
  userId: string
) {
  const session = await db.homeworkSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    throw new TRPCError({ code: "NOT_FOUND", message: "SESSION_NOT_FOUND" });
  }
  if (session.createdBy !== userId && session.studentId !== userId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return session;
}

/** Check if a parent has a family relationship with a student. */
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
  if (familyIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const studentInFamily = await db.familyMember.findFirst({
    where: {
      userId: studentId,
      familyId: { in: familyIds },
    },
  });
  if (!studentInFamily) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const homeworkRouter = router({
  /**
   * Create a new homework session.
   */
  createSession: protectedProcedure
    .input(createSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.userId;
      const { studentId } = input;

      // Student can create for themselves; parent needs family relationship
      if (userId !== studentId) {
        if (ctx.session.role === "PARENT") {
          await verifyParentStudentAccess(ctx.db, userId, studentId);
        } else {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const session = await ctx.db.homeworkSession.create({
        data: {
          studentId,
          createdBy: userId,
          status: "CREATED",
        },
      });

      return { id: session.id };
    }),

  /**
   * Get a session with its images.
   */
  getSession: protectedProcedure
    .input(getSessionSchema)
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.homeworkSession.findUnique({
        where: { id: input.sessionId },
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
          },
          questions: {
            orderBy: { questionNumber: "asc" },
          },
        },
      });

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "SESSION_NOT_FOUND" });
      }

      // Allow access for session owner, student, or family parent
      const userId = ctx.session.userId;
      const hasDirectAccess = session.createdBy === userId || session.studentId === userId;

      if (!hasDirectAccess) {
        if (ctx.session.role === "PARENT") {
          await verifyParentStudentAccess(ctx.db, userId, session.studentId);
        } else {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return session;
    }),

  /**
   * List recent sessions for a student.
   */
  listSessions: protectedProcedure
    .input(listSessionsSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.userId;
      const { studentId, limit } = input;

      // Verify access
      if (userId !== studentId) {
        if (ctx.session.role === "PARENT") {
          await verifyParentStudentAccess(ctx.db, userId, studentId);
        } else {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const sessions = await ctx.db.homeworkSession.findMany({
        where: { studentId },
        orderBy: { createdAt: "desc" },
        take: limit,
        include: {
          _count: { select: { images: true } },
        },
      });

      return sessions;
    }),

  /**
   * Update the sort order of images in a session.
   */
  updateImageOrder: protectedProcedure
    .input(updateImageOrderSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CREATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CREATED_STATUS",
        });
      }

      // Update sortOrder for each image sequentially
      for (let i = 0; i < input.imageIds.length; i++) {
        await ctx.db.homeworkImage.update({
          where: { id: input.imageIds[i] },
          data: { sortOrder: i },
        });
      }

      return { success: true };
    }),

  /**
   * Delete a session and all its images.
   */
  deleteSession: protectedProcedure
    .input(deleteSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CREATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CREATED_STATUS",
        });
      }

      // Get all images to delete from MinIO
      const images = await ctx.db.homeworkImage.findMany({
        where: { homeworkSessionId: input.sessionId },
      });

      // Delete objects from MinIO
      for (const img of images) {
        try {
          await deleteObject(img.imageUrl);
        } catch {
          // Non-fatal: object may already be deleted
        }
      }

      // Cascade delete handles images
      await ctx.db.homeworkSession.delete({
        where: { id: input.sessionId },
      });

      return { success: true };
    }),

  // --- Question CRUD (for recognition results editing) ---

  /**
   * Update a question's fields (inline editing on recognition results page).
   */
  updateQuestion: protectedProcedure
    .input(updateQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.sessionQuestion.findUnique({
        where: { id: input.questionId },
        include: { homeworkSession: true },
      });
      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "QUESTION_NOT_FOUND" });
      }

      const session = question.homeworkSession;
      if (session.createdBy !== ctx.session.userId && session.studentId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { questionId, ...data } = input;
      const updated = await ctx.db.sessionQuestion.update({
        where: { id: questionId },
        data,
      });
      return updated;
    }),

  /**
   * Delete a question (remove incorrectly recognized question).
   */
  deleteQuestion: protectedProcedure
    .input(deleteQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const question = await ctx.db.sessionQuestion.findUnique({
        where: { id: input.questionId },
        include: { homeworkSession: true },
      });
      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "QUESTION_NOT_FOUND" });
      }

      const session = question.homeworkSession;
      if (session.createdBy !== ctx.session.userId && session.studentId !== ctx.session.userId) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      await ctx.db.sessionQuestion.delete({ where: { id: input.questionId } });
      return { success: true };
    }),

  /**
   * Add a question that AI missed.
   */
  addQuestion: protectedProcedure
    .input(addQuestionSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "RECOGNIZED" && session.status !== "CREATED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_EDITABLE",
        });
      }

      // Get next question number
      const existingQuestions = await ctx.db.sessionQuestion.findMany({
        where: { homeworkSessionId: input.sessionId },
      });
      const maxNumber = existingQuestions.reduce((max, q) => Math.max(max, q.questionNumber), 0);

      const question = await ctx.db.sessionQuestion.create({
        data: {
          homeworkSessionId: input.sessionId,
          questionNumber: maxNumber + 1,
          questionType: input.questionType || undefined,
          content: input.content,
          studentAnswer: input.studentAnswer ?? null,
          correctAnswer: input.correctAnswer ?? null,
          isCorrect: input.isCorrect ?? null,
          confidence: 1.0, // Manually added = full confidence
          needsReview: false,
        },
      });
      return question;
    }),

  /**
   * Confirm recognition results and optionally update subject/grade.
   * Transitions session to CHECKING status for the check flow.
   */
  confirmResults: protectedProcedure
    .input(confirmResultsSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "RECOGNIZED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_RECOGNIZED_STATUS",
        });
      }

      // Update session with confirmed subject/grade and transition to CHECKING
      const updated = await ctx.db.homeworkSession.update({
        where: { id: input.sessionId },
        data: {
          status: "CHECKING",
          subject: input.subject || undefined,
          grade: input.grade || undefined,
        },
      });

      return updated;
    }),
});
