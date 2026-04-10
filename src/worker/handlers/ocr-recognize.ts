/**
 * OCR Recognition job handler.
 * Extracted from homework.ts startRecognition mutation (lines 224-283).
 *
 * Flow: DB read images → MinIO base64 → recognizeHomework() → create questions → update session
 * On completion: publishes event via Redis for SSE push.
 */

import type { Job } from "bullmq";
import type { OcrRecognizeJobData } from "@/lib/queue/types";
import { db } from "@/lib/db";
import { getObjectAsBase64DataUrl } from "@/lib/storage";
import { recognizeHomework } from "@/lib/ai/operations/recognize-homework";
import { publishJobResult, sessionChannel } from "@/lib/events";

export async function handleOcrRecognize(
  job: Job<OcrRecognizeJobData>,
): Promise<void> {
  const { sessionId, userId, locale, grade } = job.data;

  try {
    // Fetch images ordered by sortOrder
    const images = await db.homeworkImage.findMany({
      where: { homeworkSessionId: sessionId },
      orderBy: { sortOrder: "asc" },
    });

    if (images.length === 0) {
      throw new Error("NO_IMAGES");
    }

    // Read images from MinIO as base64 data URLs
    const imageDataUrls = await Promise.all(
      images.map((img) => getObjectAsBase64DataUrl(img.imageUrl)),
    );

    // Call AI recognition through the Harness pipeline
    const result = await recognizeHomework({
      imageUrls: imageDataUrls,
      context: {
        userId,
        locale,
        grade,
        correlationId: `recognize-${sessionId}-${job.id}`,
      },
      hasExif: images.some((img) => img.exifRotation !== 0),
    });

    if (!result.success) {
      // Check if retryable — let BullMQ retry if so
      if (result.error?.retryable) {
        throw new Error(result.error.message);
      }
      // Non-retryable failure
      await db.homeworkSession.update({
        where: { id: sessionId },
        data: { status: "RECOGNITION_FAILED" },
      });
      await publishJobResult(sessionChannel(sessionId), {
        type: "ocr-recognize",
        status: "failed",
        error: result.error?.message ?? "Recognition failed",
      });
      return;
    }

    const data = result.data!;

    // Create SessionQuestion records from AI output
    await db.sessionQuestion.createMany({
      data: data.questions.map((q) => ({
        homeworkSessionId: sessionId,
        questionNumber: q.questionNumber,
        questionType: q.questionType ?? undefined,
        content: q.content,
        studentAnswer: q.studentAnswer ?? null,
        correctAnswer: q.correctAnswer ?? null,
        isCorrect: q.isCorrect ?? null,
        confidence: q.confidence ?? null,
        needsReview: (q.confidence ?? 1) < 0.7,
        imageRegion: q.imageRegion ?? undefined,
        aiKnowledgePoint: q.knowledgePoint ?? null,
      })),
    });

    // Update session with AI-detected metadata
    await db.homeworkSession.update({
      where: { id: sessionId },
      data: {
        status: "RECOGNIZED",
        subject: data.subject ?? undefined,
        contentType: data.contentType ?? undefined,
        title: data.title ?? undefined,
      },
    });

    // Publish success event for SSE
    await publishJobResult(sessionChannel(sessionId), {
      type: "ocr-recognize",
      status: "completed",
    });
  } catch (error) {
    // On final failure (after all retries), mark as failed
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      await db.homeworkSession.update({
        where: { id: sessionId },
        data: { status: "RECOGNITION_FAILED" },
      }).catch(() => {});

      await publishJobResult(sessionChannel(sessionId), {
        type: "ocr-recognize",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
    }
    throw error; // Re-throw so BullMQ can retry
  }
}
