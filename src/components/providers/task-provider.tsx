"use client";

/**
 * TaskProvider — mounts once at the root layout (ADR-012).
 *
 * Responsibilities:
 *  1. Hydrate the Zustand store from server truth (listActive) on mount
 *  2. Subscribe to the user-wide SSE stream, merge every event into the store
 *  3. On SSE reconnect / tab-visibility return, refetch listActive to
 *     reconcile any progress missed while disconnected
 *  4. On COMPLETED / FAILED:
 *      - fire a one-shot Sonner toast so the user notices across routes
 *      - invalidate related React Query caches so the origin page re-renders
 *      - prune the entry from the store (DB row is kept as audit)
 *
 * Rules:
 *  - Does nothing when the user is not signed in (no session)
 *  - Never writes task content to localStorage directly — store handles persist
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import {
  useTaskStore,
  type TaskState,
  type TaskStoreStatus,
  type TaskStoreType,
} from "@/lib/stores/task-store";

type ListedTask = {
  id: string;
  type: TaskStoreType;
  key: string;
  status: TaskStoreStatus;
  step: string | null;
  progress: number | null;
  resultRef: { route: string; payload?: unknown } | null;
  errorMessage: string | null;
  studentId: string | null;
  createdAt: string;
  updatedAt: string;
};

function toTaskState(row: ListedTask): TaskState {
  return {
    taskId: row.id,
    type: row.type,
    key: row.key,
    status: row.status,
    step: row.step ?? undefined,
    progress: row.progress ?? undefined,
    resultRef: row.resultRef ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    studentId: row.studentId,
    startedAt: new Date(row.createdAt).getTime(),
    updatedAt: new Date(row.updatedAt).getTime(),
  };
}

export function TaskProvider({ children }: { children: React.ReactNode }) {
  const { status: sessionStatus } = useSession();
  const enabled = sessionStatus === "authenticated";

  const t = useTranslations("task");
  const utils = trpc.useUtils();
  const hydrate = useTaskStore((s) => s.hydrate);
  const applyEvent = useTaskStore((s) => s.applyEvent);
  const remove = useTaskStore((s) => s.remove);

  // 1. Hydrate from server truth on mount + when visibility returns
  const listQuery = trpc.task.listActive.useQuery(undefined, {
    enabled,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  useEffect(() => {
    if (!listQuery.data) return;
    hydrate(listQuery.data.map(toTaskState));
  }, [listQuery.data, hydrate]);

  // Re-query on visibilitychange — a stronger trigger than React Query's
  // default, since tRPC SSE may have dropped silently while the tab was hidden.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void listQuery.refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [enabled, listQuery]);

  // 2. Live SSE → merge into store
  trpc.task.onUserTaskUpdate.useSubscription(undefined, {
    enabled,
    onData: (event) => {
      applyEvent({
        taskId: event.taskId,
        type: event.type,
        key: event.key,
        status: event.status,
        step: event.step,
        progress: event.progress,
        resultRef: event.resultRef,
        errorMessage: event.errorMessage,
        updatedAt: new Date(event.updatedAt).getTime(),
      });

      // 3. Terminal state side-effects
      if (event.status === "COMPLETED" || event.status === "FAILED") {
        // Invalidate only the domain router(s) the task actually produced
        // new data for. OCR completion shouldn't re-fetch parent.* queries.
        switch (event.type) {
          case "OCR":
          case "CORRECTION":
          case "HELP":
            void utils.homework.invalidate();
            break;
          case "SUGGESTION":
            void utils.parent.invalidate();
            break;
          case "EVAL":
            void utils.eval.invalidate();
            break;
          case "BRAIN":
            void utils.brain.invalidate();
            void utils.mastery.invalidate(); // Brain may flip review schedules
            break;
        }

        const perTypeKey = `toast.${event.status === "COMPLETED" ? "completed" : "failed"}.${event.type.toLowerCase()}`;
        const genericKey = `toast.${event.status === "COMPLETED" ? "completed" : "failed"}.generic`;
        let message: string;
        try {
          message = t(perTypeKey as never);
        } catch {
          message = t(genericKey as never);
        }
        if (event.status === "COMPLETED") {
          toast.success(message);
        } else {
          toast.error(event.errorMessage || message);
        }

        // Prune from store after a short delay — keeps the dock card visible
        // long enough for the user to see the final state, then disappears.
        const keyToRemove = event.key;
        window.setTimeout(() => remove(keyToRemove), 3000);
      }
    },
    onError: (err) => {
      // Silent reconnect is fine — React Query will refetch on visibility.
      // We still surface in console so a persistent failure is visible.
      if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn("[TaskProvider] SSE error:", err);
      }
    },
  });

  return <>{children}</>;
}
