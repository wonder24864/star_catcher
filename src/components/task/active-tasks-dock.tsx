"use client";

/**
 * ActiveTasksDock — floating bottom-right widget (ADR-012).
 *
 * Visible on every route whenever the task store has QUEUED/RUNNING/
 * recently-terminal entries. Shows up to 3 cards stacked; older tasks
 * collapse into a "+N" pill. Clicking a card routes back to the origin
 * page (or resultRef.route after completion).
 *
 * Deliberately minimal: each card = 1 icon + 1 title + 1 step line + 1
 * thin progress bar. No dismiss controls — completed tasks auto-prune
 * via TaskProvider's 3s remove timer. Keeps visual weight low across
 * all tiers.
 */

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useTaskStore, type TaskState } from "@/lib/stores/task-store";

const TYPE_ICONS: Record<TaskState["type"], string> = {
  OCR: "📷",
  CORRECTION: "✍️",
  HELP: "💡",
  SUGGESTION: "🎯",
  EVAL: "🧪",
  BRAIN: "🧠",
};

function StatusDot({ status }: { status: TaskState["status"] }) {
  if (status === "COMPLETED") {
    return <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />;
  }
  if (status === "FAILED") {
    return <span className="inline-block h-2 w-2 rounded-full bg-rose-500" />;
  }
  return (
    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
  );
}

function TaskCard({ task }: { task: TaskState }) {
  const router = useRouter();
  const t = useTranslations("task");

  const target = task.resultRef?.route ?? task.originRoute;
  const onClick = () => {
    if (target) router.push(target);
  };

  // step is either an i18n key ("task.step.ocr.recognizing") or raw text —
  // try translation, fall back to raw.
  let stepText = "";
  if (task.step) {
    const stripped = task.step.startsWith("task.")
      ? task.step.slice("task.".length)
      : task.step;
    try {
      stepText = t(stripped as never);
    } catch {
      stepText = task.step;
    }
  }

  let typeText = "";
  try {
    typeText = t(`type.${task.type.toLowerCase()}` as never);
  } catch {
    typeText = task.type;
  }

  const progress =
    typeof task.progress === "number"
      ? Math.min(100, Math.max(0, task.progress))
      : null;

  const terminal = task.status === "COMPLETED" || task.status === "FAILED";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!target}
      className={[
        "group pointer-events-auto w-72 rounded-xl border bg-background/90 p-3 text-left shadow-lg backdrop-blur-md transition-all",
        "border-border/60 hover:border-border hover:shadow-xl",
        target ? "cursor-pointer" : "cursor-default",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">{TYPE_ICONS[task.type]}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <StatusDot status={task.status} />
            <span className="truncate text-sm font-medium">{typeText}</span>
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {terminal
              ? task.status === "COMPLETED"
                ? t("dock.completed")
                : (task.errorMessage ?? t("dock.failed"))
              : stepText || t("dock.running")}
          </div>
        </div>
      </div>
      {progress !== null && !terminal && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-sky-500 transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </button>
  );
}

export function ActiveTasksDock() {
  const t = useTranslations("task");
  const tasksByKey = useTaskStore((s) => s.tasksByKey);

  const tasks = useMemo(() => {
    return Object.values(tasksByKey).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }, [tasksByKey]);

  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, 3);
  const overflow = tasks.length - visible.length;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2"
    >
      {visible.map((task) => (
        <TaskCard key={task.key} task={task} />
      ))}
      {overflow > 0 && (
        <div className="pointer-events-auto rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow backdrop-blur">
          {t("dock.more", { count: overflow })}
        </div>
      )}
    </div>
  );
}
