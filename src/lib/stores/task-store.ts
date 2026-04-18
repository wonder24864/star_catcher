/**
 * Global Task Store (ADR-012).
 *
 * Cross-route source of UI truth for in-flight long-running tasks:
 *  - Buttons read it via useTaskLock(key) to stay disabled across navigation
 *  - ActiveTasksDock renders active entries on every route
 *  - TaskProvider (hydrates from tRPC listActive + applies SSE events)
 *    is the ONLY writer besides useStartTask's optimistic path
 *
 * Persisted to localStorage for first-paint continuity, but the provider
 * ALWAYS rehydrates from the server on mount so the client never trusts
 * stale local state. See docs/adr/012-global-task-progress.md §B2.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TaskStoreType =
  | "OCR"
  | "CORRECTION"
  | "HELP"
  | "SUGGESTION"
  | "EVAL"
  | "BRAIN";

export type TaskStoreStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export type TaskState = {
  /** server-side id, undefined only briefly during optimistic insert */
  taskId?: string;
  type: TaskStoreType;
  /** stable business-level idempotency key, e.g. "help:abc:q3:1" */
  key: string;
  status: TaskStoreStatus;
  step?: string;
  progress?: number;
  /** path the user was on when they triggered — clickable target in the dock */
  originRoute?: string;
  /** populated on COMPLETED; payload is small metadata only */
  resultRef?: { route: string; payload?: unknown };
  errorMessage?: string;
  studentId?: string | null;
  startedAt: number;
  updatedAt: number;
};

type TaskStore = {
  tasksByKey: Record<string, TaskState>;
  upsert: (task: TaskState) => void;
  /** merge by taskId if present, else by key */
  applyEvent: (partial: Partial<TaskState> & { key: string }) => void;
  remove: (key: string) => void;
  hydrate: (tasks: TaskState[]) => void;
  getByKey: (key: string) => TaskState | undefined;
};

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasksByKey: {},
      upsert: (task) =>
        set((state) => ({
          tasksByKey: { ...state.tasksByKey, [task.key]: task },
        })),
      applyEvent: (partial) =>
        set((state) => {
          const prev = state.tasksByKey[partial.key];
          const merged: TaskState = {
            ...prev,
            startedAt: prev?.startedAt ?? Date.now(),
            type: prev?.type ?? "OCR",
            status: prev?.status ?? "QUEUED",
            ...partial,
            key: partial.key,
            updatedAt: Date.now(),
          };
          return { tasksByKey: { ...state.tasksByKey, [partial.key]: merged } };
        }),
      remove: (key) =>
        set((state) => {
          const next = { ...state.tasksByKey };
          delete next[key];
          return { tasksByKey: next };
        }),
      hydrate: (tasks) =>
        set(() => ({
          tasksByKey: Object.fromEntries(tasks.map((t) => [t.key, t])),
        })),
      getByKey: (key) => get().tasksByKey[key],
    }),
    { name: "star-catcher-tasks" },
  ),
);
