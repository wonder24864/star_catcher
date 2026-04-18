/**
 * Task Router — reads the unified TaskRun lifecycle (ADR-012).
 *
 * Two endpoints:
 *  - listActive: current user's QUEUED|RUNNING rows (truth source for the
 *    client TaskProvider to hydrate / reconcile its Zustand store)
 *  - onUserTaskUpdate: SSE stream of TaskProgressEvent across ALL task
 *    types for the current user (OCR, correction, help, suggestion, eval,
 *    brain) — drives the global ActiveTasksDock across every route.
 */

import { router, protectedProcedure } from "../trpc";
import {
  subscribeToUserTasks,
  type TaskProgressEvent,
} from "@/lib/infra/events";
import { getActiveTasksForUser } from "@/lib/task-runner";
import type { TaskRun } from "@prisma/client";

export type ListedTask = {
  id: string;
  type: TaskRun["type"];
  key: string;
  status: TaskRun["status"];
  step: string | null;
  progress: number | null;
  resultRef: { route: string; payload?: unknown } | null;
  errorMessage: string | null;
  studentId: string | null;
  createdAt: string;
  updatedAt: string;
};

function serialize(task: TaskRun): ListedTask {
  return {
    id: task.id,
    type: task.type,
    key: task.key,
    status: task.status,
    step: task.step,
    progress: task.progress,
    resultRef:
      (task.resultRef as unknown as { route: string; payload?: unknown } | null) ??
      null,
    errorMessage: task.errorMessage,
    studentId: task.studentId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export const taskRouter = router({
  listActive: protectedProcedure.query(async ({ ctx }): Promise<ListedTask[]> => {
    const rows = await getActiveTasksForUser(ctx.session.userId, ctx.db);
    return rows.map(serialize);
  }),

  onUserTaskUpdate: protectedProcedure.subscription(async function* (opts) {
    const signal = opts.signal ?? AbortSignal.timeout(300_000);
    for await (const event of subscribeToUserTasks(
      opts.ctx.session.userId,
      signal,
    )) {
      yield event satisfies TaskProgressEvent;
    }
  }),
});
