/**
 * OCR Recognition job handler.
 * Extracted from homework.ts startRecognition mutation (lines 224-283).
 *
 * Flow: DB read images → MinIO base64 → recognizeHomework() → create questions → update session
 * On completion: publishes event via Redis for SSE push.
 */

import type { Job } from "bullmq";
import type { OcrRecognizeJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { getObjectAsBase64DataUrl } from "@/lib/infra/storage";
import { recognizeHomework } from "@/lib/domain/ai/operations/recognize-homework";
import { publishJobResult, sessionChannel } from "@/lib/infra/events";
import {
  updateTaskStep,
  completeTask,
  failTask,
} from "@/lib/task-runner";

export async function handleOcrRecognize(
  job: Job<OcrRecognizeJobData>,
): Promise<void> {
  const { sessionId, userId, locale, grade, taskId } = job.data;

  try {
    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.ocr.loadingImages",
        progress: 10,
      });
    }
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

    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.ocr.recognizing",
        progress: 40,
      });
    }

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
      if (taskId) {
        await failTask(taskId, {
          errorCode: "OCR_FAILED",
          errorMessage: result.error?.message ?? "Recognition failed",
        });
      }
      return;
    }

    const data = result.data!;

    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.ocr.saving",
        progress: 80,
      });
    }

    // Resolve sourceImageIndex (0-based into images ordered by sortOrder) to
    // homeworkImageId so the canvas UI can render each bbox on the right image.
    // Falls back to images[0] for missing/out-of-range indices — the AI
    // sometimes omits it on single-image input.
    const resolveImageId = (idx: number | null | undefined): string => {
      const i = typeof idx === "number" && idx >= 0 && idx < images.length ? idx : 0;
      return images[i]!.id;
    };

    // Create SessionQuestion records from AI output
    await db.sessionQuestion.createMany({
      data: data.questions.map((q) => ({
        homeworkSessionId: sessionId,
        homeworkImageId: resolveImageId(q.sourceImageIndex),
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
    if (taskId) {
      await completeTask(taskId, {
        resultRef: { route: `/check/${sessionId}` },
      });
    }
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

      if (taskId) {
        await failTask(taskId, {
          errorCode: "OCR_EXCEPTION",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        }).catch(() => {});
      }
    }
    throw error; // Re-throw so BullMQ can retry
  }
}
