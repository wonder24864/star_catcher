/**
 * Help Generation job handler.
 * Extracted from homework.ts requestHelp mutation (lines 1117-1165).
 *
 * Flow: generateHelp() → create HelpRequest record → publish SSE event
 */

import type { Job } from "bullmq";
import type { HelpGenerateJobData } from "@/lib/queue/types";
import { db } from "@/lib/db";
import { generateHelp } from "@/lib/ai/operations/help-generate";
import { publishJobResult, helpChannel } from "@/lib/events";

export async function handleHelpGenerate(
  job: Job<HelpGenerateJobData>,
): Promise<void> {
  const { sessionId, questionId, userId, locale, grade, level, subject } =
    job.data;

  try {
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
  } catch (error) {
    if (job.attemptsMade >= (job.opts.attempts ?? 1) - 1) {
      await publishJobResult(helpChannel(sessionId, questionId), {
        type: "help-generate",
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(() => {});
    }
    throw error;
  }
}
