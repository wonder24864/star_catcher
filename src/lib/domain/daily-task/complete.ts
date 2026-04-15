/**
 * DailyTask completion — shared transactional helper.
 *
 * Used by both:
 *   - dailyTask.completeTask (REVIEW & EXPLANATION manual flows)
 *   - dailyTask.submitPracticeAnswer (PRACTICE flow, after AI grading)
 *
 * Semantics:
 *   - Owner check (studentId match)
 *   - Optimistic transition: only PENDING → COMPLETED counts; concurrent
 *     callers see alreadyCompleted = true
 *   - Pack.completedTasks++, transition pack to IN_PROGRESS or COMPLETED
 *
 * See: docs/sprints/sprint-13.md (Task 119 D-4)
 */

import type { db } from "@/lib/infra/db";

export interface CompleteDailyTaskParams {
  taskId: string;
  expectedStudentId: string;
}

export interface CompleteDailyTaskResult {
  alreadyCompleted: boolean;
  allDone: boolean;
  /** True when the caller's owner check failed (task belongs to another student). */
  ownerMismatch?: boolean;
  /** True when no DailyTask exists for the given id. */
  notFound?: boolean;
}

/**
 * Accept either the extended root `db` client or a transaction sub-client.
 * We only touch dailyTask + dailyTaskPack accessors so a structural pick
 * from the project's actual extended client keeps us in sync with the
 * `$extends` query overrides (soft-delete filter etc).
 */
export type DailyTaskTxClient = Pick<
  typeof db,
  "dailyTask" | "dailyTaskPack"
>;

export async function completeDailyTaskInTx(
  tx: DailyTaskTxClient,
  params: CompleteDailyTaskParams,
): Promise<CompleteDailyTaskResult> {
  const task = await tx.dailyTask.findUnique({
    where: { id: params.taskId },
    include: {
      pack: {
        select: {
          id: true,
          studentId: true,
          totalTasks: true,
          completedTasks: true,
        },
      },
    },
  });

  if (!task) {
    return { alreadyCompleted: false, allDone: false, notFound: true };
  }
  if (task.pack.studentId !== params.expectedStudentId) {
    return { alreadyCompleted: false, allDone: false, ownerMismatch: true };
  }

  const updated = await tx.dailyTask.updateMany({
    where: { id: params.taskId, status: "PENDING" },
    data: { status: "COMPLETED", completedAt: new Date() },
  });

  if (updated.count === 0) {
    return { alreadyCompleted: true, allDone: false };
  }

  const updatedPack = await tx.dailyTaskPack.update({
    where: { id: task.pack.id },
    data: { completedTasks: { increment: 1 } },
    select: { completedTasks: true, totalTasks: true },
  });

  const allDone = updatedPack.completedTasks >= updatedPack.totalTasks;
  await tx.dailyTaskPack.update({
    where: { id: task.pack.id },
    data: { status: allDone ? "COMPLETED" : "IN_PROGRESS" },
  });

  return { alreadyCompleted: false, allDone };
}
