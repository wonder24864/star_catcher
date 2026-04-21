"use client";

/**
 * HelpPanel — progressive "帮帮我" (3 levels) for a single question.
 *
 * Sprint 17: extracted from the now-deleted /results page so the canvas
 * QuestionDetailSheet can reuse it. Behavior mirrors the old inline panel
 * exactly: cache-hit requests return immediately; new requests enqueue a
 * BullMQ job and the SSE subscription invalidates the cache on completion.
 *
 * Gating: only rendered for questions with isCorrect !== true; callers
 * should skip mounting it on correct questions. Max-level-by-parent is
 * enforced server-side (requestHelp), so UI only needs to surface the
 * resulting error toasts.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Lightbulb, HelpCircle, Lock, ChevronDown, ChevronUp } from "lucide-react";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { MathText } from "@/components/ui/math-text";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { useTier } from "@/components/providers/grade-tier-provider";
import { useStartTask, useTaskLock } from "@/hooks/use-task";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type HelpRequest = {
  id: string;
  level: number;
  aiResponse: string;
  createdAt: Date;
};

function HelpRequestButton({
  sessionId,
  questionId,
  level,
  isSubmitting,
  onRequest,
  label,
  loadingLabel,
}: {
  sessionId: string;
  questionId: string;
  level: 1 | 2 | 3;
  isSubmitting: boolean;
  onRequest: () => void;
  label: string;
  loadingLabel: string;
}) {
  const lock = useTaskLock(`help:${sessionId}:${questionId}:${level}`);
  const disabled = lock.locked || isSubmitting;
  return (
    <AdaptiveButton
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={disabled}
      onClick={onRequest}
    >
      {disabled ? (
        loadingLabel
      ) : (
        <>
          <Lightbulb className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </AdaptiveButton>
  );
}

export function HelpPanel({
  sessionId,
  questionId,
  isCorrect,
  isCompleted,
  defaultExpanded = false,
}: {
  sessionId: string;
  questionId: string;
  isCorrect: boolean | null;
  isCompleted: boolean;
  /** Start expanded — useful when mounted inside a detail sheet. */
  defaultExpanded?: boolean;
}) {
  const t = useTranslations();
  const tH = useTierTranslations("homework");
  const { tierIndex } = useTier();
  const isWonder = tierIndex === 1;
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [pendingHelp, setPendingHelp] = useState(false);

  const utils = trpc.useUtils();

  const { data: helpRequests = [] } = trpc.homework.getHelpRequests.useQuery(
    { sessionId, questionId },
    { enabled: expanded },
  );

  trpc.subscription.onHelpGenerated.useSubscription(
    { sessionId, questionId },
    {
      enabled: pendingHelp,
      onData: (event) => {
        if (event.type === "help-generate") {
          setPendingHelp(false);
          utils.homework.getHelpRequests.invalidate({ sessionId, questionId });
          if (event.status === "failed") {
            toast.error(t("homework.help.generationFailed"));
          }
        }
      },
    },
  );

  const requestHelpMutation = trpc.homework.requestHelp.useMutation({
    onSuccess: (data) => {
      if ("status" in data && data.status === "processing") {
        setPendingHelp(true);
      } else {
        utils.homework.getHelpRequests.invalidate({ sessionId, questionId });
      }
    },
    onError: (err) => {
      const msg = err.message;
      if (msg === "NEW_ANSWER_REQUIRED_TO_UNLOCK") {
        toast.error(t("homework.help.locked"));
      } else if (msg === "HELP_LEVEL_EXCEEDS_MAX") {
        toast.error(t("homework.help.lockedByParent", { level: "" }));
      } else if (msg === "HELP_GENERATION_FAILED") {
        toast.error(t("homework.help.generationFailed"));
      } else {
        toast.error(t("error.serverError"));
      }
    },
  });

  const { start: startHelp } = useStartTask({
    type: "HELP",
    buildKey: (input: { sessionId: string; questionId: string; level: 1 | 2 | 3 }) =>
      `help:${input.sessionId}:${input.questionId}:${input.level}`,
    mutation: requestHelpMutation,
  });

  if (isCorrect === true) return null;

  const helpMap = new Map(helpRequests.map((h: HelpRequest) => [h.level, h]));
  const maxRevealedLevel =
    helpRequests.length > 0 ? Math.max(...helpRequests.map((h: HelpRequest) => h.level)) : 0;
  const nextLevel = (maxRevealedLevel + 1) as 1 | 2 | 3;

  const levelLabels: Record<number, string> = {
    1: t("homework.help.level1"),
    2: t("homework.help.level2"),
    3: t("homework.help.level3"),
  };

  const hintBg = isWonder ? "bg-amber-50" : "bg-blue-50";
  const hintBorder = isWonder ? "border-amber-200" : "border-blue-200";
  const hintIconColor = isWonder ? "text-amber-600" : "text-blue-600";
  const hintLabelColor = isWonder ? "text-amber-700" : "text-blue-700";

  return (
    <div className="mt-2">
      {!defaultExpanded && (
        <AdaptiveButton
          variant="ghost"
          size="sm"
          className={cn(hintIconColor, "gap-1.5")}
          onClick={() => setExpanded((v) => !v)}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {tH("help.button")}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </AdaptiveButton>
      )}

      {(expanded || defaultExpanded) && (
        <div className={cn("mt-2 space-y-2 pl-2 border-l-2", hintBorder)}>
          {[1, 2, 3].map((level) => {
            const help = helpMap.get(level);
            if (!help) return null;
            return (
              <div key={level} className={cn(hintBg, "rounded-lg p-3")}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Lightbulb className={cn("h-3.5 w-3.5", hintIconColor)} />
                  <span className={cn("text-xs font-semibold", hintLabelColor)}>
                    {t("homework.help.title", { level })} — {levelLabels[level]}
                  </span>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  <MathText text={help.aiResponse} />
                </div>
              </div>
            );
          })}

          {!isCompleted && nextLevel <= 3 && (
            <HelpRequestButton
              sessionId={sessionId}
              questionId={questionId}
              level={nextLevel}
              isSubmitting={requestHelpMutation.isPending}
              onRequest={() => void startHelp({ sessionId, questionId, level: nextLevel })}
              label={t("homework.help.nextLevel", { level: nextLevel })}
              loadingLabel={t("homework.help.loading")}
            />
          )}

          {maxRevealedLevel >= 3 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {tH("help.maxLevelReached")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
