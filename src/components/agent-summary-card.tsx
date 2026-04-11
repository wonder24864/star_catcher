"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AgentSummaryData {
  id: string;
  status: string;
  summary: string | null;
  totalSteps: number;
  totalDurationMs: number;
  createdAt: string | Date;
}

/**
 * Parse diagnosis summary string into structured data.
 * Format: "Error pattern: {PATTERN}. {N} weak KP(s) identified. {M} mastery state(s) updated."
 */
function parseDiagnosisSummary(summary: string) {
  const patternMatch = summary.match(/Error pattern: (\w+)\./);
  const weakMatch = summary.match(/(\d+) weak KP/);
  const masteryMatch = summary.match(/(\d+) mastery state/);

  return {
    errorPattern: patternMatch?.[1] ?? null,
    weakKPCount: weakMatch ? parseInt(weakMatch[1], 10) : null,
    masteryUpdates: masteryMatch ? parseInt(masteryMatch[1], 10) : null,
  };
}

export function AgentSummaryCard({ trace }: { trace: AgentSummaryData | null | undefined }) {
  const t = useTranslations();
  const { data: session } = useSession();

  if (!trace) return null;

  const isAdmin = session?.user?.role === "ADMIN";
  const isRunning = trace.status === "RUNNING";
  const isFailed = trace.status === "FAILED";

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            AI
          </CardTitle>
          <StatusBadge status={trace.status} t={t} />
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isRunning && (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm">{t("agentTrace.summary.analyzing")}</span>
          </div>
        )}

        {isFailed && (
          <p className="text-sm text-red-600">{t("agentTrace.summary.failed")}</p>
        )}

        {!isRunning && !isFailed && trace.summary && (
          <SummaryContent summary={trace.summary} t={t} />
        )}

        {!isRunning && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {trace.totalSteps} {t("agentTrace.steps")} · {trace.totalDurationMs}{t("agentTrace.ms")}
            </span>
            {isAdmin && (
              <Link
                href={`/admin/agent-traces/${trace.id}`}
                className="text-primary hover:underline"
              >
                {t("agentTrace.summary.viewDetail")}
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, t }: { status: string; t: ReturnType<typeof useTranslations> }) {
  const colors: Record<string, string> = {
    RUNNING: "bg-blue-100 text-blue-700",
    COMPLETED: "bg-green-100 text-green-700",
    TERMINATED: "bg-yellow-100 text-yellow-700",
    FAILED: "bg-red-100 text-red-700",
  };

  return (
    <Badge className={colors[status] ?? ""} variant="secondary">
      {t(`agentTrace.status.${status}`)}
    </Badge>
  );
}

function SummaryContent({
  summary,
  t,
}: {
  summary: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const parsed = parseDiagnosisSummary(summary);

  if (!parsed.errorPattern) {
    // Not a standard diagnosis summary (e.g. question-understanding) — display as-is
    // TODO: Add structured parsers for other agent types when their summary formats stabilize
    return <p className="text-sm">{summary}</p>;
  }

  // Known error patterns with i18n keys
  const KNOWN_PATTERNS = new Set([
    "CONCEPT_CONFUSION", "CALCULATION_ERROR", "METHOD_WRONG", "CARELESS", "OTHER",
  ]);
  const localizedPattern = KNOWN_PATTERNS.has(parsed.errorPattern)
    ? t(`agentTrace.summary.patterns.${parsed.errorPattern}`)
    : parsed.errorPattern;

  return (
    <div className="space-y-1 text-sm">
      {parsed.errorPattern && (
        <p>
          {t("agentTrace.summary.errorPattern", { pattern: localizedPattern })}
        </p>
      )}
      {parsed.weakKPCount !== null && (
        <p>{t("agentTrace.summary.weakKPs", { count: parsed.weakKPCount })}</p>
      )}
      {parsed.masteryUpdates !== null && (
        <p>{t("agentTrace.summary.masteryUpdates", { count: parsed.masteryUpdates })}</p>
      )}
    </div>
  );
}
