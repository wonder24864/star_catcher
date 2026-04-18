"use client";

/**
 * ExplanationSection — parent-side "看讲解" panel on the error question
 * detail page. Three states:
 *
 *  1. Cached: ErrorQuestion.explanation has data AND passes Zod validation
 *     → render ExplanationCard immediately. Malformed cache (shape drift
 *     after schema changes) → treated as missing, re-generate allowed.
 *  2. Idle: button "生成讲解" → click triggers useStartTask → worker runs
 *     GENERATE_EXPLANATION → caches to DB → global task event → TaskProvider
 *     invalidates error router → this component re-renders with fresh data.
 *  3. Running: button disabled. Live step/progress shown inline so the user
 *     stays informed without hunting for the floating dock, while dock also
 *     tracks for cross-route visibility (ADR-013).
 *
 * Student side never renders this (guarded by caller role check), AND the
 * API strips ErrorQuestion.explanation when role === STUDENT.
 */

import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { useStartTask, useTaskLock } from "@/hooks/use-task";
import { ExplanationCard } from "@/components/tasks/explanation-card";
import {
  explanationCardSchema,
  type ExplanationCard as ExplanationCardData,
} from "@/lib/domain/ai/harness/schemas/generate-explanation";

export function ExplanationSection({
  errorQuestionId,
  cached,
}: {
  errorQuestionId: string;
  /** ErrorQuestion.explanation JSON. Unknown shape — validated here. */
  cached: unknown;
}) {
  const t = useTranslations("errors.explanation");
  const tTask = useTranslations("task");

  const requestMutation = trpc.error.requestExplanation.useMutation();

  const { start: requestExplanation } = useStartTask({
    type: "EXPLANATION",
    buildKey: (input: { errorQuestionId: string }) =>
      `explanation:${input.errorQuestionId}`,
    mutation: requestMutation,
  });

  const lock = useTaskLock(`explanation:${errorQuestionId}`);
  const busy = lock.locked || requestMutation.isPending;

  // P2-6: validate cached JSON. A shape mismatch (older schema, corrupt
  // row) shouldn't crash the UI — treat as "not generated" and let the
  // parent regenerate.
  let validCached: ExplanationCardData | null = null;
  if (cached != null) {
    const parsed = explanationCardSchema.safeParse(cached);
    if (parsed.success) validCached = parsed.data;
  }

  // 1. Cached — render it inline, no button
  if (validCached) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">{t("title")}</h3>
        <ExplanationCard card={validCached} onComplete={() => {}} />
      </div>
    );
  }

  // 2 + 3. Idle / running — step/progress rendered inline when busy.
  const stepKey = lock.step?.startsWith("task.") ? lock.step.slice(5) : null;
  let stepLabel: string | undefined;
  if (stepKey) {
    try {
      stepLabel = tTask(stepKey as never);
    } catch {
      stepLabel = lock.step ?? undefined;
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed bg-muted/30 p-6 text-center">
      <div className="flex flex-col items-center gap-1">
        <Sparkles className="h-6 w-6 text-primary" />
        <h3 className="text-base font-semibold">{t("title")}</h3>
        <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
      </div>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => void requestExplanation({ errorQuestionId })}
      >
        {busy ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {t("generating")}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            {t("generate")}
          </>
        )}
      </Button>
      {busy && (
        <div className="space-y-2">
          {stepLabel && (
            <p className="text-sm font-medium text-primary">{stepLabel}</p>
          )}
          {typeof lock.progress === "number" && (
            <div className="mx-auto h-1.5 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-sky-500 transition-[width] duration-500"
                style={{ width: `${Math.min(100, Math.max(0, lock.progress))}%` }}
              />
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("backgroundHint")}
          </p>
        </div>
      )}
    </div>
  );
}
