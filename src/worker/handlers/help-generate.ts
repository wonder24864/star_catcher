/**
 * Help Generation job handler.
 * Extracted from homework.ts requestHelp mutation (lines 1117-1165).
 *
 * Flow: generateHelp() → create HelpRequest record → publish SSE event
 */

import type { Job } from "bullmq";
import type { HelpGenerateJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { generateHelp } from "@/lib/domain/ai/operations/help-generate";
import { publishJobResult, helpChannel } from "@/lib/infra/events";
import {
  updateTaskStep,
  completeTask,
  failTask,
} from "@/lib/task-runner";

export async function handleHelpGenerate(
  job: Job<HelpGenerateJobData>,
): Promise<void> {
  const { sessionId, questionId, userId, locale, grade, level, subject, taskId } =
    job.data;

  try {
    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.help.analyzing",
        progress: 20,
      });
    }
    // Fetch question content for the AI prompt
    const question = await db.sessionQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      throw new Error("QUESTION_NOT_FOUND");
    }

    // Fetch session for subject/grade context
    const session = await db.homeworkSession.findUnique({
      where: { id: sessionId },
    });

    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.help.generating",
        progress: 55,
      });
    }

    // Call AI Harness
    const result = await generateHelp({
      questionContent: question.content,
      studentAnswer: question.studentAnswer ?? "",
      correctAnswer: question.correctAnswer ?? undefined,
      helpLevel: level,
      subject: subject ?? session?.subject ?? undefined,
      grade: grade ?? session?.grade ?? undefined,
      context: {
        userId,
        locale,
        grade,
        correlationId: `help-${sessionId}-${questionId}-${job.id}`,
      },
    });

    if (!result.success) {
      // Use fallback text if available
      const fallbackText = result.fallback
        ? JSON.stringify(result.fallback)
        : null;

      if (fallbackText) {
        await db.helpRequest.create({
          data: {
            homeworkSessionId: sessionId,
            sessionQuestionId: questionId,
            level,
            aiResponse: fallbackText,
          },
        });

        await publishJobResult(helpChannel(sessionId, questionId), {
          type: "help-generate",
          status: "completed",
          data: { level, fallback: true },
        });
        if (taskId) {
          await completeTask(taskId, {
            resultRef: {
              route: `/check/${sessionId}/results`,
              payload: { questionId, level, fallback: true },
            },
          });
        }
        return;
      }

      // Retryable?
      if (result.error?.retryable) {
        throw new Error(result.error.message);
      }

      await publishJobResult(helpChannel(sessionId, questionId), {
        type: "help-generate",
        status: "failed",
        error: result.error?.message ?? "Help generation failed",
      });
      if (taskId) {
        await failTask(taskId, {
          errorCode: "HELP_FAILED",
          errorMessage: result.error?.message ?? "Help generation failed",
        });
      }
      return;
    }

    // Store help response
    await db.helpRequest.create({
      data: {
        homeworkSessionId: sessionId,
        sessionQuestionId: questionId,
        level,
        aiResponse: result.data!.helpText,
      },
    });

    // Publish success event
    await publishJobResult(helpChannel(sessionId, questionId), {
      type: "help-generate",
      status: "completed",
      data: { level },
    });
    if (taskId) {
      await completeTask(taskId, {
        resultRef: {
          route: `/check/${sessionId}/results`,
          payload: { questionId, level },
        },
      });
    }
  } catch (error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      await publishJobResult(helpChannel(sessionId, questionId), {
        type: "help-generate",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
      if (taskId) {
        await failTask(taskId, {
          errorCode: "HELP_EXCEPTION",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        }).catch(() => {});
      }
    }
    throw error;
  }
}
