"use client";

/**
 * ExplanationSection — parent-side "看讲解" panel on the error question
 * detail page. Three states:
 *
 *  1. Cached: ErrorQuestion.explanation already has data → render
 *     ExplanationCard immediately (no AI call).
 *  2. Idle: button "生成讲解" → click triggers useStartTask → worker runs
 *     GENERATE_EXPLANATION → caches to DB → global task event → TaskProvider
 *     invalidates error router → this component re-renders with fresh data.
 *  3. Running: button disabled, local inline hint + the global dock
 *     shows the actual progress (ADR-013).
 *
 * Student side never renders this (guarded by caller role check).
 */

import { useTranslations } from "next-intl";
import { Loader2, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { useStartTask, useTaskLock } from "@/hooks/use-task";
import { ExplanationCard } from "@/components/tasks/explanation-card";
import type {
  ExplanationCard as ExplanationCardData,
} from "@/lib/domain/ai/harness/schemas/generate-explanation";

export function ExplanationSection({
  errorQuestionId,
  cached,
}: {
  errorQuestionId: string;
  /** current ErrorQuestion.explanation JSON from server — null means never generated */
  cached: ExplanationCardData | null;
}) {
  const t = useTranslations("errors.explanation");

  const requestMutation = trpc.error.requestExplanation.useMutation();

  const { start: requestExplanation } = useStartTask({
    type: "EXPLANATION",
    buildKey: (input: { errorQuestionId: string }) =>
      `explanation:${input.errorQuestionId}`,
    mutation: requestMutation,
  });

  const lock = useTaskLock(`explanation:${errorQuestionId}`);
  const busy = lock.locked || requestMutation.isPending;

  // 1. Cached — render it inline, no button
  if (cached) {
    return (
      <div className="space-y-3">
        <h3 className="text-lg font-semibold">{t("title")}</h3>
        <ExplanationCard card={cached} onComplete={() => {}} />
      </div>
    );
  }

  // 2 + 3. Idle / running
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
        <p className="text-xs text-muted-foreground">
          {t("backgroundHint")}
        </p>
      )}
    </div>
  );
}
