/**
 * Generate-explanation job handler.
 *
 * Parent clicks "看讲解" on an ErrorQuestion → mutation creates TaskRun +
 * enqueues this job → worker calls GENERATE_EXPLANATION operation → caches
 * the structured ExplanationCard to ErrorQuestion.explanation.
 *
 * Students never call this directly (see ADR on student-parent visibility).
 * See: docs/adr/013-global-task-progress.md
 */

import type { Job } from "bullmq";
import type { GenerateExplanationJobData } from "@/lib/infra/queue/types";
import type { PrismaClient, Prisma } from "@prisma/client";
import { db } from "@/lib/infra/db";
import { generateExplanation } from "@/lib/domain/ai/operations/generate-explanation";
import { createLogger } from "@/lib/infra/logger";
import {
  updateTaskStep,
  completeTask,
  failTask,
} from "@/lib/task-runner";

export async function handleGenerateExplanation(
  job: Job<GenerateExplanationJobData>,
): Promise<void> {
  const { errorQuestionId, userId, studentId, locale, taskId } = job.data;
  const log = createLogger("worker:generate-explanation").child({
    jobId: job.id,
    errorQuestionId,
  });

  try {
    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.explanation.loading",
        progress: 15,
      });
    }

    // Load the error question — RBAC already enforced at mutation layer,
    // but we still verify studentId consistency as defense in depth.
    const eq = await db.errorQuestion.findFirst({
      where: { id: errorQuestionId, studentId, deletedAt: null },
      select: {
        id: true,
        content: true,
        correctAnswer: true,
        studentAnswer: true,
        subject: true,
        grade: true,
        aiKnowledgePoint: true,
        explanation: true,
      },
    });

    if (!eq) {
      throw new Error("ERROR_QUESTION_NOT_FOUND");
    }

    // Cache hit — already generated. Complete immediately.
    if (eq.explanation) {
      log.info("cache hit, skipping AI call");
      if (taskId) {
        await completeTask(taskId, {
          resultRef: {
            route: `/errors/${errorQuestionId}`,
            payload: { cached: true },
          },
        });
      }
      return;
    }

    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.explanation.generating",
        progress: 55,
      });
    }

    // kpName fallback: an empty string confuses the prompt ("the student
    // is learning about `{{kpName}}`"). If the error question was created
    // before the KG was populated, fall back to a human-readable descriptor
    // derived from subject + grade so the AI has *some* context.
    const kpName =
      eq.aiKnowledgePoint?.trim() ||
      (eq.grade ? `${eq.subject} (${eq.grade})` : eq.subject);

    const result = await generateExplanation({
      questionContent: eq.content,
      correctAnswer: eq.correctAnswer,
      studentAnswer: eq.studentAnswer,
      kpName,
      subject: eq.subject,
      grade: eq.grade ?? undefined,
      format: "auto",
      locale,
      context: {
        userId,
        locale,
        grade: eq.grade ?? undefined,
        correlationId: `explain-${errorQuestionId}-${job.id}`,
      },
    });

    if (!result.success || !result.data) {
      if (result.error?.retryable) {
        throw new Error(result.error.message);
      }
      if (taskId) {
        await failTask(taskId, {
          errorCode: "EXPLANATION_FAILED",
          errorMessage: result.error?.message ?? "Explanation generation failed",
        });
      }
      return;
    }

    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.explanation.saving",
        progress: 90,
      });
    }

    // Cache to ErrorQuestion.explanation so next open is free
    await (db as unknown as PrismaClient).errorQuestion.update({
      where: { id: errorQuestionId },
      data: { explanation: result.data as unknown as Prisma.InputJsonValue },
    });

    if (taskId) {
      await completeTask(taskId, {
        resultRef: {
          route: `/errors/${errorQuestionId}`,
          payload: { generated: true },
        },
      });
    }

    log.info({ format: result.data.format }, "explanation generated");
  } catch (error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      if (taskId) {
        await failTask(taskId, {
          errorCode: "EXPLANATION_EXCEPTION",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        }).catch(() => {});
      }
    }
    throw error;
  }
}
