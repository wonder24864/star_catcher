/**
 * EvalFramework run handler — Sprint 16 US-058.
 *
 * Flow: load EvalRun row (must be RUNNING) → call EvalRunner → finalize row.
 *
 * Idempotent: if the row is already COMPLETED, skip; if FAILED, skip (admin
 * must re-trigger manually). Does NOT retry on exception — single attempt
 * (configured in enqueueEvalRun: attempts=1) — because re-running duplicates
 * cases and wastes tokens.
 *
 * See docs/sprints/sprint-16.md (Task 139).
 */
import type { Job } from "bullmq";
import type { AIOperationType } from "@prisma/client";
import type { EvalRunJobData } from "@/lib/infra/queue/types";
import { db } from "@/lib/infra/db";
import { createLogger } from "@/lib/infra/logger";
import { runEval } from "@/lib/domain/ai/eval/eval-runner";
import { callAIOperation } from "@/lib/domain/ai/operations/registry";
import {
  updateTaskStep,
  completeTask,
  failTask,
} from "@/lib/task-runner";

export async function handleEvalRun(
  job: Job<EvalRunJobData>,
): Promise<void> {
  const { runId, operations, userId, locale, taskId } = job.data;
  const log = createLogger("worker:eval-run").child({
    jobId: job.id,
    runId,
    userId,
  });

  const existing = await db.evalRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true },
  });

  if (!existing) {
    log.warn({ runId }, "EvalRun not found, skipping");
    return;
  }

  if (existing.status !== "RUNNING") {
    log.info(
      { runId, currentStatus: existing.status },
      "EvalRun not in RUNNING state, skipping (admin must re-trigger)",
    );
    return;
  }

  log.info({ operations }, "starting EvalRun");

  if (taskId) {
    await updateTaskStep(taskId, {
      step: "task.step.eval.loadingCases",
      progress: 10,
    });
  }

  try {
    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.eval.running",
        progress: 40,
      });
    }
    const result = await runEval(
      {
        runId,
        adminId: userId,
        operations: operations as AIOperationType[],
        locale,
      },
      {
        db,
        callAIOperation,
      },
    );
    log.info(
      {
        totalCases: result.totalCases,
        passed: result.passedCases,
        failed: result.failedCases,
        errored: result.erroredCases,
        skipped: result.skippedCases,
        passRate: result.passRate,
      },
      "EvalRun completed",
    );
    if (taskId) {
      await completeTask(taskId, {
        resultRef: {
          route: `/admin/eval/${runId}`,
          payload: {
            totalCases: result.totalCases,
            passed: result.passedCases,
            failed: result.failedCases,
            passRate: result.passRate,
          },
        },
      });
    }
  } catch (err) {
    log.error({ err }, "EvalRun crashed, marking FAILED");
    await db.evalRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        note: (err as Error).message.slice(0, 500),
      },
    });
    if (taskId) {
      await failTask(taskId, {
        errorCode: "EVAL_CRASHED",
        errorMessage: (err as Error).message,
      }).catch(() => {});
    }
    throw err;
  }
}
