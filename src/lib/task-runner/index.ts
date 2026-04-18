/**
 * Task Runner — unified lifecycle helpers for long-running user-visible jobs.
 *
 * Thin wrapper over Prisma's TaskRun model + Redis user-wide publish channel.
 * Used by:
 *   - tRPC mutations (createTaskRun on enqueue)
 *   - Worker handlers (updateTaskStep / completeTask / failTask)
 *
 * See docs/adr/012-global-task-progress.md
 */

import type { Prisma, TaskRun, TaskStatus, TaskType } from "@prisma/client";
import { Prisma as PrismaNS } from "@prisma/client";
import { db as defaultDb } from "@/lib/infra/db";
import { publishTaskEvent, type TaskProgressEvent } from "@/lib/infra/events";

type ResultRef = { route: string; payload?: unknown };

/**
 * Narrow db shape task-runner needs. Injecting keeps unit tests from hitting
 * the real Postgres + leaves space for transactional callers (`prisma.$tx`)
 * to pass their tx-client through.
 */
type TaskRunDb = {
  taskRun: {
    findFirst: (args: { where: Prisma.TaskRunWhereInput }) => Promise<TaskRun | null>;
    findMany: (args: {
      where: Prisma.TaskRunWhereInput;
      orderBy?: Prisma.TaskRunOrderByWithRelationInput;
    }) => Promise<TaskRun[]>;
    create: (args: { data: Prisma.TaskRunCreateInput }) => Promise<TaskRun>;
    update: (args: {
      where: Prisma.TaskRunWhereUniqueInput;
      data: Prisma.TaskRunUpdateInput;
    }) => Promise<TaskRun>;
  };
};

async function publishFor(task: TaskRun): Promise<void> {
  const event: TaskProgressEvent = {
    taskId: task.id,
    type: task.type,
    key: task.key,
    status: task.status,
    step: task.step ?? undefined,
    progress: task.progress ?? undefined,
    resultRef:
      (task.resultRef as unknown as ResultRef | null) ?? undefined,
    errorCode: task.errorCode ?? undefined,
    errorMessage: task.errorMessage ?? undefined,
    updatedAt: task.updatedAt.toISOString(),
  };
  await publishTaskEvent(task.userId, event);
}

export interface CreateTaskRunInput {
  type: TaskType;
  key: string;
  userId: string;
  studentId?: string | null;
  bullJobId?: string | null;
  step?: string;
}

/**
 * Create a new TaskRun row (status=QUEUED) and publish the initial event.
 *
 * Idempotent by (userId, key): if an active row (QUEUED or RUNNING) already
 * exists it is returned with `isNew: false` — the mutation layer MUST NOT
 * re-enqueue a BullMQ job in that case (otherwise a double-click doubles
 * the AI cost). See docs/adr/013-global-task-progress.md.
 */
export async function createTaskRun(
  db: TaskRunDb,
  input: CreateTaskRunInput,
): Promise<{ task: TaskRun; isNew: boolean }> {
  const existing = await db.taskRun.findFirst({
    where: {
      userId: input.userId,
      key: input.key,
      status: { in: ["QUEUED", "RUNNING"] },
    },
  });
  if (existing) return { task: existing, isNew: false };

  const created = await db.taskRun.create({
    data: {
      userId: input.userId,
      studentId: input.studentId ?? null,
      type: input.type,
      key: input.key,
      bullJobId: input.bullJobId ?? null,
      status: "QUEUED",
      step: input.step ?? null,
    },
  });
  await publishFor(created);
  return { task: created, isNew: true };
}

/**
 * Back-fill the BullMQ job id onto an existing TaskRun. Called by the
 * mutation layer AFTER enqueue, because createTaskRun → enqueue is a
 * two-step sequence (the jobId isn't known until enqueue returns).
 * Pure DB update, no event publish — this field is for forensic lookup,
 * not for the UI stream.
 */
export async function attachBullJobId(
  db: TaskRunDb,
  taskId: string,
  bullJobId: string,
): Promise<void> {
  await db.taskRun.update({
    where: { id: taskId },
    data: { bullJobId },
  });
}

/**
 * Advance the task's step/progress. Transitions QUEUED → RUNNING on first call.
 * Safe to call many times per handler (one per logical phase).
 */
export async function updateTaskStep(
  taskId: string,
  input: { step: string; progress?: number | null },
  db: TaskRunDb = defaultDb,
): Promise<void> {
  const data: Prisma.TaskRunUpdateInput = {
    status: "RUNNING",
    step: input.step,
  };
  if (input.progress !== undefined) data.progress = input.progress;

  const updated = await db.taskRun.update({
    where: { id: taskId },
    data,
  });
  await publishFor(updated);
}

/**
 * Terminal success. Sets status=COMPLETED, stamps completedAt, publishes.
 * resultRef is a pointer — NOT the full payload — so user-wide broadcast
 * stays small. Business payload goes on the domain-specific SSE channel.
 */
export async function completeTask(
  taskId: string,
  input: { resultRef?: ResultRef; step?: string },
  db: TaskRunDb = defaultDb,
): Promise<void> {
  const updated = await db.taskRun.update({
    where: { id: taskId },
    data: {
      status: "COMPLETED",
      step: input.step ?? null,
      progress: 100,
      resultRef:
        input.resultRef === undefined
          ? PrismaNS.JsonNull
          : (input.resultRef as unknown as Prisma.InputJsonValue),
      completedAt: new Date(),
    },
  });
  await publishFor(updated);
}

/**
 * Terminal failure. Records errorCode/message, publishes, returns.
 * Idempotent across BullMQ retries — pass the SAME taskId; subsequent
 * `failTask` calls just re-publish the failed state.
 */
export async function failTask(
  taskId: string,
  input: { errorCode?: string; errorMessage: string },
  db: TaskRunDb = defaultDb,
): Promise<void> {
  const updated = await db.taskRun.update({
    where: { id: taskId },
    data: {
      status: "FAILED",
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage,
      completedAt: new Date(),
    },
  });
  await publishFor(updated);
}

/**
 * Read all active (QUEUED | RUNNING) tasks for a user. Called by
 * the task.listActive tRPC query — the truth source the client hydrates from.
 */
export async function getActiveTasksForUser(
  userId: string,
  db: TaskRunDb = defaultDb,
): Promise<TaskRun[]> {
  return db.taskRun.findMany({
    where: { userId, status: { in: ["QUEUED", "RUNNING"] } },
    orderBy: { createdAt: "desc" },
  });
}

export type { TaskRun, TaskStatus, TaskType };
