import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, type Context } from "../trpc";
import { deleteObject } from "@/lib/storage";
import { calculateScore } from "@/lib/scoring";
import { gradeAnswer } from "@/lib/ai/operations/grade-answer";
import { generateHelp } from "@/lib/ai/operations/help-generate";
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
  getCheckStatusSchema,
  completeSessionSchema,
  submitCorrectionsSchema,
  requestHelpSchema,
  getHelpRequestsSchema,
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

/**
 * Default max help level by grade band (ADR-004):
 * - Elementary (PRIMARY_*): 2
 * - Middle/High school: 3
 */
function getDefaultMaxHelpLevel(grade: string | null | undefined): number {
  if (!grade) return 2;
  if (grade.startsWith("PRIMARY_")) return 2;
  return 3;
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
   * Transitions session to CHECKING status and creates CheckRound #1
   * based on the current isCorrect values from OCR recognition.
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

      // Compute round 1 scores from OCR-confirmed isCorrect values
      const questions = await ctx.db.sessionQuestion.findMany({
        where: { homeworkSessionId: input.sessionId },
      });
      const totalQuestions = questions.length;
      const correctCount = questions.filter((q) => q.isCorrect === true).length;
      const score = calculateScore(correctCount, totalQuestions);

      // Transition session to CHECKING and record round count
      const updated = await ctx.db.homeworkSession.update({
        where: { id: input.sessionId },
        data: {
          status: "CHECKING",
          subject: input.subject || undefined,
          grade: input.grade || undefined,
          totalRounds: 1,
        },
      });

      // Create CheckRound #1 with per-question results
      await ctx.db.checkRound.create({
        data: {
          homeworkSessionId: input.sessionId,
          roundNumber: 1,
          score,
          totalQuestions,
          correctCount,
          results: {
            create: questions.map((q) => ({
              sessionQuestionId: q.id,
              studentAnswer: q.studentAnswer,
              isCorrect: q.isCorrect ?? false,
              correctedFromPrev: false,
            })),
          },
        },
      });

      return updated;
    }),

  // --- Check flow state machine ---

  /**
   * Get full check status: all rounds with per-question results.
   * Used by the check results page (Task 20).
   */
  getCheckStatus: protectedProcedure
    .input(getCheckStatusSchema)
    .query(async ({ ctx, input }) => {
      const session = await ctx.db.homeworkSession.findUnique({
        where: { id: input.sessionId },
        include: {
          questions: { orderBy: { questionNumber: "asc" } },
          checkRounds: {
            orderBy: { roundNumber: "asc" },
            include: { results: true },
          },
        },
      });

      if (!session) {
        throw new TRPCError({ code: "NOT_FOUND", message: "SESSION_NOT_FOUND" });
      }

      const userId = ctx.session.userId;
      const hasDirectAccess =
        session.createdBy === userId || session.studentId === userId;

      if (!hasDirectAccess) {
        if (ctx.session.role === "PARENT") {
          await verifyParentStudentAccess(ctx.db, userId, session.studentId);
        } else {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      if (session.status !== "CHECKING" && session.status !== "COMPLETED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CHECK_PHASE",
        });
      }

      return session;
    }),

  /**
   * Complete the check session.
   * Transitions CHECKING → COMPLETED, sets finalScore to last round's score.
   */
  completeSession: protectedProcedure
    .input(completeSessionSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CHECKING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CHECKING_STATUS",
        });
      }

      // Get the last round's score
      const lastRound = await ctx.db.checkRound.findFirst({
        where: { homeworkSessionId: input.sessionId },
        orderBy: { roundNumber: "desc" },
      });

      const updated = await ctx.db.homeworkSession.update({
        where: { id: input.sessionId },
        data: {
          status: "COMPLETED",
          finalScore: lastRound?.score ?? null,
        },
      });

      return updated;
    }),

  /**
   * Submit corrected answers and start a new check round.
   * Calls AI to grade each correction, creates CheckRound N+1.
   * Uses optimistic locking on totalRounds to prevent concurrent submissions.
   */
  submitCorrections: protectedProcedure
    .input(submitCorrectionsSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CHECKING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CHECKING_STATUS",
        });
      }

      // Fetch all questions for score recalculation
      const allQuestions = await ctx.db.sessionQuestion.findMany({
        where: { homeworkSessionId: input.sessionId },
      });
      const questionMap = new Map(allQuestions.map((q) => [q.id, q]));

      // Grade each correction in parallel via AI Harness
      const correctedIds = new Set(input.corrections.map((c) => c.questionId));
      const gradeJobs = input.corrections.map(async (correction) => {
        const question = questionMap.get(correction.questionId);
        if (!question) return null;

        const result = await gradeAnswer({
          questionContent: question.content,
          studentAnswer: correction.newAnswer,
          correctAnswer: question.correctAnswer ?? null,
          subject: session.subject ?? undefined,
          grade: session.grade ?? undefined,
          context: {
            userId: ctx.session.userId,
            locale: ctx.session.locale,
            grade: session.grade ?? undefined,
            correlationId: `submit-${input.sessionId}`,
          },
        });

        return {
          questionId: question.id,
          newAnswer: correction.newAnswer,
          // AI failure → mark as needsReview, treat as incorrect
          isCorrect: result.success ? (result.data?.isCorrect ?? false) : false,
          confidence: result.success ? (result.data?.confidence ?? 0) : 0,
          needsReview: !result.success,
        };
      });

      const gradeResults = (await Promise.all(gradeJobs)).filter(
        (r): r is NonNullable<typeof r> => r !== null
      );

      // Update each corrected SessionQuestion
      for (const grade of gradeResults) {
        await ctx.db.sessionQuestion.update({
          where: { id: grade.questionId },
          data: {
            studentAnswer: grade.newAnswer,
            isCorrect: grade.isCorrect,
            confidence: grade.confidence,
            needsReview: grade.needsReview,
          },
        });
      }

      // Recalculate score from all questions' current state
      const updatedQuestions = await ctx.db.sessionQuestion.findMany({
        where: { homeworkSessionId: input.sessionId },
      });
      const totalQuestions = updatedQuestions.length;
      const correctCount = updatedQuestions.filter((q) => q.isCorrect === true).length;
      const score = calculateScore(correctCount, totalQuestions);
      const newRoundNumber = session.totalRounds + 1;

      // Create the new CheckRound with per-question results
      await ctx.db.checkRound.create({
        data: {
          homeworkSessionId: input.sessionId,
          roundNumber: newRoundNumber,
          score,
          totalQuestions,
          correctCount,
          results: {
            create: updatedQuestions.map((q) => ({
              sessionQuestionId: q.id,
              studentAnswer: q.studentAnswer,
              isCorrect: q.isCorrect ?? false,
              correctedFromPrev: correctedIds.has(q.id),
            })),
          },
        },
      });

      // Optimistic lock: update totalRounds only if session hasn't changed
      const lockResult = await ctx.db.homeworkSession.updateMany({
        where: { id: input.sessionId, updatedAt: session.updatedAt },
        data: { totalRounds: newRoundNumber },
      });

      if (lockResult.count === 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "DATA_CONFLICT",
        });
      }

      return { success: true, newRoundNumber, score };
    }),

  // --- Help (progressive reveal) ---

  /**
   * Get all help requests for a specific question.
   * Returns cached AI help responses for display.
   */
  getHelpRequests: protectedProcedure
    .input(getHelpRequestsSchema)
    .query(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CHECKING" && session.status !== "COMPLETED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CHECK_PHASE",
        });
      }

      const helpRequests = await ctx.db.helpRequest.findMany({
        where: {
          homeworkSessionId: input.sessionId,
          sessionQuestionId: input.questionId,
        },
        orderBy: { level: "asc" },
      });

      return helpRequests;
    }),

  /**
   * Request help for a wrong question (progressive reveal).
   *
   * Business rules (BUSINESS-RULES.md §7):
   * - Level 1 available immediately for wrong questions
   * - Level N+1 requires a new answer attempt after viewing Level N
   * - Empty string doesn't count as a valid answer
   * - Parent maxHelpLevel setting caps available levels
   * - Same question+level returns cached response (no duplicate AI calls)
   * - Optimistic locking via session updatedAt
   */
  requestHelp: protectedProcedure
    .input(requestHelpSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CHECKING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CHECKING_STATUS",
        });
      }

      // Verify question belongs to this session
      const question = await ctx.db.sessionQuestion.findFirst({
        where: {
          id: input.questionId,
          homeworkSessionId: input.sessionId,
        },
      });
      if (!question) {
        throw new TRPCError({ code: "NOT_FOUND", message: "QUESTION_NOT_FOUND" });
      }

      // Only wrong questions can request help
      if (question.isCorrect === true) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "QUESTION_ALREADY_CORRECT",
        });
      }

      // --- Parent maxHelpLevel enforcement ---
      const parentConfig = await ctx.db.parentStudentConfig.findFirst({
        where: { studentId: session.studentId },
      });
      const maxHelpLevel = parentConfig?.maxHelpLevel ?? getDefaultMaxHelpLevel(session.grade);
      if (input.level > maxHelpLevel) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "HELP_LEVEL_EXCEEDS_MAX",
        });
      }

      // --- Cache check: return existing help if already generated ---
      const existing = await ctx.db.helpRequest.findFirst({
        where: {
          sessionQuestionId: input.questionId,
          level: input.level,
        },
      });
      if (existing) {
        return existing;
      }

      // --- Level gating: Level 2+ requires a new answer after previous level ---
      if (input.level > 1) {
        const prevLevel = input.level - 1;
        const prevHelp = await ctx.db.helpRequest.findFirst({
          where: {
            sessionQuestionId: input.questionId,
            level: prevLevel,
          },
        });
        if (!prevHelp) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "PREVIOUS_LEVEL_NOT_REQUESTED",
          });
        }

        // Check that student submitted a new (different, non-empty) answer
        // since the previous help was requested.
        // We check RoundQuestionResults created AFTER the previous help request.
        const answersAfterPrevHelp = await ctx.db.roundQuestionResult.findMany({
          where: {
            sessionQuestionId: input.questionId,
            checkRound: {
              homeworkSessionId: input.sessionId,
              createdAt: { gt: prevHelp.createdAt },
            },
          },
          orderBy: { checkRound: { createdAt: "desc" } },
        });

        if (answersAfterPrevHelp.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "NEW_ANSWER_REQUIRED_TO_UNLOCK",
          });
        }
      }

      // --- Call AI Harness ---
      const result = await generateHelp({
        questionContent: question.content,
        studentAnswer: question.studentAnswer ?? "",
        correctAnswer: question.correctAnswer ?? undefined,
        helpLevel: input.level,
        subject: session.subject ?? undefined,
        grade: session.grade ?? undefined,
        context: {
          userId: ctx.session.userId,
          locale: ctx.session.locale,
          grade: session.grade ?? undefined,
          correlationId: `help-${input.sessionId}-${input.questionId}`,
        },
      });

      if (!result.success) {
        // Use fallback text if available
        const fallbackText = result.fallback
          ? JSON.stringify(result.fallback)
          : null;
        if (fallbackText) {
          const helpRequest = await ctx.db.helpRequest.create({
            data: {
              homeworkSessionId: input.sessionId,
              sessionQuestionId: input.questionId,
              level: input.level,
              aiResponse: fallbackText,
            },
          });
          return helpRequest;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "HELP_GENERATION_FAILED",
        });
      }

      // Store help response (cache for future requests)
      const helpRequest = await ctx.db.helpRequest.create({
        data: {
          homeworkSessionId: input.sessionId,
          sessionQuestionId: input.questionId,
          level: input.level,
          aiResponse: result.data!.helpText,
        },
      });

      return helpRequest;
    }),
});
