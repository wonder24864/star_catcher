"use client";

/**
 * RoundHistoryDrawer — collapsible panel listing all past check rounds.
 *
 * Sprint 17: replaces the multi-round display that used to live on the
 * standalone /results page. Shows score progression and lets the user see
 * which questions improved between rounds (correctedFromPrev flag).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronUp, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AdaptiveScore } from "@/components/adaptive/adaptive-score";

export type CheckRoundSummary = {
  id: string;
  roundNumber: number;
  score: number | null;
  totalQuestions: number | null;
  correctCount: number | null;
};

export function RoundHistoryDrawer({ rounds }: { rounds: CheckRoundSummary[] }) {
  const t = useTranslations();
  const [expanded, setExpanded] = useState(false);

  if (rounds.length === 0) return null;

  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          {t("homework.check.scoreHistory")}
          <span className="text-xs">
            ({t("homework.markup.roundsCount", { count: rounds.length })})
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t px-3 py-2 flex flex-wrap items-center gap-2">
          {rounds.map((r, i) => (
            <span key={r.id} className="flex items-center gap-1 text-sm">
              {i > 0 && <span className="text-muted-foreground mx-0.5">→</span>}
              <Badge
                variant={i === rounds.length - 1 ? "default" : "secondary"}
                className={cn("gap-1")}
              >
                {t("homework.check.round", { round: r.roundNumber })}
                <AdaptiveScore
                  value={r.score ?? 0}
                  className="ml-1"
                  tierOverride="studio"
                />
              </Badge>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
