import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, type Context } from "../trpc";
import { deleteObject } from "@/lib/infra/storage";
import { calculateScore } from "@/lib/domain/scoring";
import { computeContentHash } from "@/lib/domain/content-hash";
import { gradeAnswer } from "@/lib/domain/ai/operations/grade-answer";
import { detectSubject } from "@/lib/domain/ai/operations/subject-detect";
import {
  enqueueRecognition,
  enqueueCorrectionPhotos,
  enqueueHelpGeneration,
  enqueueQuestionUnderstanding,
} from "@/lib/infra/queue";
import {
  createSessionSchema,
  getSessionSchema,
  listSessionsSchema,
  startRecognitionSchema,
  updateImageOrderSchema,
  deleteSessionSchema,
  updateQuestionSchema,
  deleteQuestionSchema,
  addQuestionSchema,
  confirmResultsSchema,
  getCheckStatusSchema,
  completeSessionSchema,
  submitCorrectionsSchema,
  submitCorrectionPhotosSchema,
  createManualErrorSchema,
  requestHelpSchema,
  getHelpRequestsSchema,
} from "@/lib/domain/validations/homework";

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

function inferSchoolLevel(grade: string): "PRIMARY" | "JUNIOR" | "SENIOR" {
  if (grade.startsWith("PRIMARY_")) return "PRIMARY";
  if (grade.startsWith("JUNIOR_")) return "JUNIOR";
  return "SENIOR";
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
   * Start AI recognition on uploaded images.
   * CREATED/RECOGNITION_FAILED → RECOGNIZING → RECOGNIZED/RECOGNITION_FAILED
   */
  startRecognition: protectedProcedure
    .input(startRecognitionSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CREATED" && session.status !== "RECOGNITION_FAILED" && session.status !== "RECOGNIZING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CREATED_STATUS",
        });
      }

      // Fetch images ordered by sortOrder
      const images = await ctx.db.homeworkImage.findMany({
        where: { homeworkSessionId: input.sessionId },
        orderBy: { sortOrder: "asc" },
      });

      if (images.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NO_IMAGES",
        });
      }

      // If retrying, clean up previous partial results
      if (session.status === "RECOGNITION_FAILED" || session.status === "RECOGNIZING") {
        await ctx.db.sessionQuestion.deleteMany({
          where: { homeworkSessionId: input.sessionId },
        });
      }

      // Transition to RECOGNIZING
      await ctx.db.homeworkSession.update({
        where: { id: input.sessionId },
        data: { status: "RECOGNIZING" },
      });

      // Enqueue async AI recognition job (BullMQ)
      // Worker will: read images → call AI → create questions → update session status
      // Frontend receives result via SSE subscription
      const jobId = await enqueueRecognition({
        sessionId: input.sessionId,
        userId: ctx.session.userId,
        locale: ctx.session.locale,
        grade: session.grade ?? undefined,
      });

      return { status: "processing" as const, sessionId: input.sessionId, jobId };
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
   * Auto-records wrong questions to ErrorQuestion table (Task 25, US-019).
   * Dedup: contentHash match → update totalAttempts; else create new.
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

      // --- Auto-record wrong questions to error notebook (Task 25) ---
      const questions = await ctx.db.sessionQuestion.findMany({
        where: { homeworkSessionId: input.sessionId },
      });
      const wrongQuestions = questions.filter(
        (q: { isCorrect: boolean | null }) => q.isCorrect !== true
      );

      // Collect ErrorQuestion IDs for Agent trigger
      const errorQuestionEntries: Array<{ errorQuestionId: string; content: string }> = [];

      for (const q of wrongQuestions) {
        const hash = computeContentHash(q.content);

        // Check for existing ErrorQuestion with same content for this student
        const existing = await ctx.db.errorQuestion.findFirst({
          where: {
            studentId: session.studentId,
            contentHash: hash,
          },
        });

        if (existing) {
          // Dedup: bump totalAttempts
          await ctx.db.errorQuestion.update({
            where: { id: existing.id },
            data: { totalAttempts: existing.totalAttempts + 1 },
          });
          errorQuestionEntries.push({ errorQuestionId: existing.id, content: q.content });
        } else {
          // Create new ErrorQuestion
          const created = await ctx.db.errorQuestion.create({
            data: {
              studentId: session.studentId,
              sessionQuestionId: q.id,
              subject: session.subject ?? "OTHER",
              contentType: session.contentType ?? undefined,
              grade: session.grade ?? undefined,
              questionType: q.questionType ?? undefined,
              content: q.content,
              contentHash: hash,
              studentAnswer: q.studentAnswer ?? undefined,
              correctAnswer: q.correctAnswer ?? undefined,
              aiKnowledgePoint: q.aiKnowledgePoint ?? undefined,
            },
          });
          errorQuestionEntries.push({ errorQuestionId: created.id, content: q.content });
        }
      }

      // --- Auto-trigger Question Understanding Agent (Task 56, US-033) ---
      // Enqueue asynchronously — don't block the response
      for (const entry of errorQuestionEntries) {
        if (entry.content && entry.content.trim().length > 0) {
          enqueueQuestionUnderstanding({
            sessionId: input.sessionId,
            questionId: entry.errorQuestionId,
            questionText: entry.content,
            subject: session.subject ?? "OTHER",
            grade: session.grade ?? undefined,
            schoolLevel: session.grade
              ? inferSchoolLevel(session.grade)
              : "PRIMARY",
            studentId: session.studentId,
            userId: ctx.session.userId,
            locale: ctx.session.locale ?? "zh-CN",
          }).catch((err) => {
            console.error(
              `[completeSession] Failed to enqueue question-understanding for ${entry.errorQuestionId}:`,
              err,
            );
          });
        }
      }

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

  /**
   * Submit corrections via re-photographed homework.
   * Student re-photographs corrected homework → AI re-recognizes → matches & re-grades.
   */
  submitCorrectionPhotos: protectedProcedure
    .input(submitCorrectionPhotosSchema)
    .mutation(async ({ ctx, input }) => {
      const session = await verifySessionAccess(ctx.db, input.sessionId, ctx.session.userId);

      if (session.status !== "CHECKING") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "SESSION_NOT_IN_CHECKING_STATUS",
        });
      }

      // Verify images exist before enqueuing
      const correctionImages = await ctx.db.homeworkImage.findMany({
        where: {
          id: { in: input.imageIds },
          homeworkSessionId: input.sessionId,
        },
      });

      if (correctionImages.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "NO_IMAGES" });
      }

      // Enqueue async correction photos job (BullMQ)
      // Worker will: recognize → match → re-grade → create CheckRound
      // Frontend receives result via SSE subscription
      const jobId = await enqueueCorrectionPhotos({
        sessionId: input.sessionId,
        imageIds: input.imageIds,
        userId: ctx.session.userId,
        locale: ctx.session.locale,
        grade: session.grade ?? undefined,
      });

      return { status: "processing" as const, jobId };
    }),

  // --- Manual error input (Task 24, US-010) ---

  /**
   * Create a manual error question with AI subject auto-detection.
   * Directly creates an ErrorQuestion (not via HomeworkSession flow).
   * Subject detection: confidence >= 0.8 auto-accepted, < 0.8 user may override.
   */
  createManualError: protectedProcedure
    .input(createManualErrorSchema)
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

      // Detect subject via AI Harness (unless user explicitly provides one)
      type ContentTypeEnum = "EXAM" | "HOMEWORK" | "DICTATION" | "COPYWRITING" | "ORAL_CALC" | "COMPOSITION" | "OTHER";
      let subject = input.subject ?? "OTHER";
      let contentType: ContentTypeEnum | undefined;

      if (!input.subject) {
        const detectResult = await detectSubject({
          questionContent: input.content,
          studentAnswer: input.studentAnswer,
          context: {
            userId,
            locale: ctx.session.locale,
            correlationId: `manual-${Date.now()}`,
          },
        });

        if (detectResult.success && detectResult.data) {
          // Auto-accept at >= 0.8 confidence; otherwise use as default
          subject = detectResult.data.subject;
          contentType = (detectResult.data.contentType as ContentTypeEnum) ?? undefined;
        }
        // On AI failure: fallback to OTHER (already set above)
      }

      // Compute content hash for dedup
      const hash = computeContentHash(input.content);

      // Check for existing ErrorQuestion with same content for this student
      const existing = await ctx.db.errorQuestion.findFirst({
        where: {
          studentId,
          contentHash: hash,
        },
      });

      if (existing) {
        // Dedup: bump totalAttempts, update fields
        const updated = await ctx.db.errorQuestion.update({
          where: { id: existing.id },
          data: {
            totalAttempts: existing.totalAttempts + 1,
            studentAnswer: input.studentAnswer ?? existing.studentAnswer,
            correctAnswer: input.correctAnswer ?? existing.correctAnswer,
            subject,
          },
        });
        return updated;
      }

      // Create new ErrorQuestion
      const errorQuestion = await ctx.db.errorQuestion.create({
        data: {
          studentId,
          subject,
          contentType: contentType ?? undefined,
          questionType: input.questionType ?? undefined,
          content: input.content,
          contentHash: hash,
          studentAnswer: input.studentAnswer ?? undefined,
          correctAnswer: input.correctAnswer ?? undefined,
        },
      });

      return errorQuestion;
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

      // --- Enqueue async help generation job (BullMQ) ---
      // Worker will: call AI → create HelpRequest
      // Frontend receives result via SSE subscription
      const jobId = await enqueueHelpGeneration({
        sessionId: input.sessionId,
        questionId: input.questionId,
        userId: ctx.session.userId,
        locale: ctx.session.locale,
        grade: session.grade ?? undefined,
        level: input.level as 1 | 2 | 3,
        subject: session.subject ?? undefined,
      });

      return { status: "processing" as const, jobId };
    }),
});
