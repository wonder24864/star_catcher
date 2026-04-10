/**
 * Correction Photos job handler.
 * Extracted from homework.ts submitCorrectionPhotos mutation (lines 767-894).
 *
 * Compound job: recognize corrected photos → match questions → re-grade → create CheckRound
 * On completion: publishes event via Redis for SSE push.
 */

import type { Job } from "bullmq";
import type { CorrectionPhotosJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { getObjectAsBase64DataUrl } from "@/lib/infra/storage";
import { recognizeHomework } from "@/lib/domain/ai/operations/recognize-homework";
import { gradeAnswer } from "@/lib/domain/ai/operations/grade-answer";
import { calculateScore } from "@/lib/domain/scoring";
import { publishJobResult, sessionChannel } from "@/lib/infra/events";

export async function handleCorrectionPhotos(
  job: Job<CorrectionPhotosJobData>,
): Promise<void> {
  const { sessionId, imageIds, userId, locale, grade } = job.data;

  try {
    // Fetch session for optimistic locking
    const session = await db.homeworkSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new Error("SESSION_NOT_FOUND");

    // Fetch correction images by ID
    const correctionImages = await db.homeworkImage.findMany({
      where: {
        id: { in: imageIds },
        homeworkSessionId: sessionId,
      },
      orderBy: { sortOrder: "asc" },
    });

    if (correctionImages.length === 0) {
      throw new Error("NO_IMAGES");
    }

    // Read images from MinIO as base64
    const imageDataUrls = await Promise.all(
      correctionImages.map((img) => getObjectAsBase64DataUrl(img.imageUrl)),
    );

    // Re-recognize homework from corrected photos
    const recognitionResult = await recognizeHomework({
      imageUrls: imageDataUrls,
      context: {
        userId,
        locale,
        grade,
        correlationId: `correction-${sessionId}-${job.id}`,
      },
      hasExif: correctionImages.some((img) => img.exifRotation !== 0),
    });

    if (!recognitionResult.success || !recognitionResult.data) {
      if (recognitionResult.error?.retryable) {
        throw new Error(recognitionResult.error.message);
      }
      await publishJobResult(sessionChannel(sessionId), {
        type: "correction-photos",
        status: "failed",
        error: recognitionResult.error?.message ?? "Recognition failed",
      });
      return;
    }

    const newRecognized = recognitionResult.data;

    // Build map of newly recognized answers by questionNumber
    const newAnswerMap = new Map(
      newRecognized.questions.map((q) => [q.questionNumber, q]),
    );

    // Fetch existing questions
    const existingQuestions = await db.sessionQuestion.findMany({
      where: { homeworkSessionId: sessionId },
    });

    // Match by questionNumber and detect changed answers, then re-grade
    const correctedIds = new Set<string>();
    const gradeJobs = existingQuestions
      .filter((eq) => {
        const newQ = newAnswerMap.get(eq.questionNumber);
        if (!newQ) return false;
        const newAnswer = newQ.studentAnswer ?? "";
        const oldAnswer = eq.studentAnswer ?? "";
        return newAnswer !== oldAnswer && newAnswer.length > 0;
      })
      .map(async (eq) => {
        const newQ = newAnswerMap.get(eq.questionNumber)!;
        correctedIds.add(eq.id);

        const result = await gradeAnswer({
          questionContent: eq.content,
          studentAnswer: newQ.studentAnswer!,
          correctAnswer: eq.correctAnswer ?? null,
          subject: session.subject ?? undefined,
          grade: session.grade ?? undefined,
          context: {
            userId,
            locale,
            grade,
            correlationId: `correction-grade-${sessionId}-${job.id}`,
          },
        });

        return {
          questionId: eq.id,
          newAnswer: newQ.studentAnswer!,
          isCorrect: result.success ? (result.data?.isCorrect ?? false) : false,
          confidence: result.success ? (result.data?.confidence ?? 0) : 0,
          needsReview: !result.success,
        };
      });

    const gradeResults = await Promise.all(gradeJobs);

    // Update corrected SessionQuestions
    for (const g of gradeResults) {
      await db.sessionQuestion.update({
        where: { id: g.questionId },
        data: {
          studentAnswer: g.newAnswer,
          isCorrect: g.isCorrect,
          confidence: g.confidence,
          needsReview: g.needsReview,
        },
      });
    }

    // Recalculate score
    const updatedQuestions = await db.sessionQuestion.findMany({
      where: { homeworkSessionId: sessionId },
    });
    const totalQuestions = updatedQuestions.length;
    const correctCount = updatedQuestions.filter(
      (q) => q.isCorrect === true,
    ).length;
    const score = calculateScore(correctCount, totalQuestions);
    const newRoundNumber = session.totalRounds + 1;

    // Create new CheckRound
    await db.checkRound.create({
      data: {
        homeworkSessionId: sessionId,
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

    // Optimistic lock: update totalRounds
    const lockResult = await db.homeworkSession.updateMany({
      where: { id: sessionId, updatedAt: session.updatedAt },
      data: { totalRounds: newRoundNumber },
    });

    if (lockResult.count === 0) {
      // Conflict — still publish result so frontend knows
      console.warn(`[correction-photos] Optimistic lock conflict for session ${sessionId}`);
    }

    // Publish success event
    await publishJobResult(sessionChannel(sessionId), {
      type: "correction-photos",
      status: "completed",
      data: { newRoundNumber, score },
    });
  } catch (error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      await publishJobResult(sessionChannel(sessionId), {
        type: "correction-photos",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
    }
    throw error;
  }
}
