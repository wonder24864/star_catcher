"use client";

/**
 * Task hooks (ADR-012).
 *
 * - useTaskLock(key): read-only. Tells a button whether it is currently
 *   "owned" by an in-flight task. Survives navigation, remount, browser
 *   refresh (hydrated from server by TaskProvider).
 *
 * - useStartTask: wraps a tRPC mutation so clicks are:
 *     1) lock-checked (short-circuits if already running)
 *     2) optimistically inserted into the store (button locks instantly)
 *     3) reconciled when the server returns taskId / taskKey
 *     4) reverted if the mutation fails BEFORE the worker even starts
 *        (server never wrote a TaskRun, so the SSE stream will never clean up)
 */

import { usePathname } from "next/navigation";
import { useCallback } from "react";
import {
  useTaskStore,
  type TaskState,
  type TaskStoreType,
} from "@/lib/stores/task-store";

export function useTaskLock(key: string | null | undefined): {
  locked: boolean;
  step?: string;
  progress?: number;
  status?: TaskState["status"];
} {
  const entry = useTaskStore((s) => (key ? s.tasksByKey[key] : undefined));
  if (!entry) return { locked: false };
  const locked = entry.status === "QUEUED" || entry.status === "RUNNING";
  return {
    locked,
    step: entry.step,
    progress: entry.progress,
    status: entry.status,
  };
}

type AnyMutationResult = {
  taskId?: string | null;
  taskKey?: string;
} & Record<string, unknown>;

type MutationLike<TInput, TOutput> = {
  mutateAsync: (input: TInput) => Promise<TOutput>;
  isPending?: boolean;
};

export interface UseStartTaskOptions<TInput, TOutput extends AnyMutationResult> {
  type: TaskStoreType;
  /** build the stable idempotency key from the input */
  buildKey: (input: TInput) => string;
  /** the tRPC mutation hook result — pass e.g. `trpc.homework.startRecognition.useMutation()` */
  mutation: MutationLike<TInput, TOutput>;
  /** optional student id to carry onto the task row */
  studentIdFor?: (input: TInput) => string | null | undefined;
}

/**
 * Wraps a tRPC mutation so clicks: check the lock → optimistically insert
 * into the store → run mutation → roll back on failure. Callers read the
 * actual lock state via `useTaskLock(key)` — that's richer (also returns
 * step/progress) and composes with any key, not just the last-started one.
 */
export function useStartTask<TInput, TOutput extends AnyMutationResult>(
  opts: UseStartTaskOptions<TInput, TOutput>,
): {
  start: (input: TInput) => Promise<TOutput | null>;
} {
  const pathname = usePathname();
  const upsert = useTaskStore((s) => s.upsert);
  const applyEvent = useTaskStore((s) => s.applyEvent);
  const remove = useTaskStore((s) => s.remove);
  const getByKey = useTaskStore((s) => s.getByKey);

  const start = useCallback(
    async (input: TInput): Promise<TOutput | null> => {
      const key = opts.buildKey(input);
      const existing = getByKey(key);
      if (existing && (existing.status === "QUEUED" || existing.status === "RUNNING")) {
        // Double-click guard: already running, do nothing
        return null;
      }

      const now = Date.now();
      // Optimistic insert — button locks immediately while the mutation flies.
      upsert({
        type: opts.type,
        key,
        status: "QUEUED",
        originRoute: pathname ?? undefined,
        studentId: opts.studentIdFor?.(input) ?? null,
        startedAt: now,
        updatedAt: now,
      });

      try {
        const result = await opts.mutation.mutateAsync(input);
        // Reconcile: stamp the real taskId WITHOUT clobbering fields the
        // SSE stream may have already written (step/progress/status advance).
        // applyEvent merges; raw upsert would overwrite.
        if (result?.taskId) {
          applyEvent({ key, taskId: result.taskId });
        }
        return result;
      } catch (err) {
        // The server never created a TaskRun → SSE will never clean this up.
        // Roll back the optimistic entry so the button unlocks.
        remove(key);
        throw err;
      }
    },
    [opts, pathname, upsert, applyEvent, remove, getByKey],
  );

  return { start };
}
