"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations, useLocale } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  TERMINATED: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
};

const STEP_STATUS_COLORS: Record<string, string> = {
  SUCCESS: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
  TIMEOUT: "bg-yellow-100 text-yellow-700",
};

export default function AgentTraceDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const traceId = params.traceId as string;

  const { data: trace, isLoading } = trpc.agentTrace.detail.useQuery(
    { traceId },
    { enabled: !!traceId },
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="max-w-4xl">
        <p className="py-12 text-center text-muted-foreground">Trace not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Back link */}
      <Link href={`/${locale}/admin/agent-traces`} className="text-sm text-muted-foreground hover:underline">
        ← {t("agentTrace.title")}
      </Link>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("agentTrace.detail.title")}</CardTitle>
            <Badge className={STATUS_COLORS[trace.status] ?? ""} variant="secondary">
              {t(`agentTrace.status.${trace.status}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground">{t("agentTrace.list.agent")}</p>
            <p className="font-medium">{trace.agentName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentTrace.list.user")}</p>
            <p className="font-medium">{trace.user.nickname || trace.user.username}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentTrace.detail.terminationReason")}</p>
            <p className="font-medium">{trace.terminationReason ?? "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentTrace.detail.totalTokens")}</p>
            <p className="font-medium">{trace.totalInputTokens + trace.totalOutputTokens}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentTrace.detail.totalDuration")}</p>
            <p className="font-medium">{trace.totalDurationMs}{t("agentTrace.ms")}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t("agentTrace.list.steps")}</p>
            <p className="font-medium">{trace.totalSteps}</p>
          </div>
        </CardContent>
      </Card>

      {/* Summary Text */}
      {trace.summary && (
        <Card>
          <CardHeader>
            <CardTitle>{t("agentTrace.detail.summary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{trace.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Step Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t("agentTrace.detail.stepTimeline")}</CardTitle>
        </CardHeader>
        <CardContent>
          {trace.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {trace.status === "RUNNING" ? t("agentTrace.summary.analyzing") : "-"}
            </p>
          ) : (
            <div className="relative ml-4 space-y-0">
              {trace.steps.map((step, index) => (
                <StepNode
                  key={step.id}
                  step={step}
                  isLast={index === trace.steps.length - 1}
                  t={t}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StepNode({
  step,
  isLast,
  t,
}: {
  step: {
    id: string;
    stepNo: number;
    skillName: string;
    input: unknown;
    output: unknown;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    status: string;
    errorMessage: string | null;
  };
  isLast: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative pb-6">
      {/* Vertical line */}
      {!isLast && (
        <div className="absolute left-[7px] top-6 h-full w-px bg-border" />
      )}

      {/* Dot */}
      <div className="flex items-start gap-3">
        <div
          className={`mt-1.5 h-4 w-4 shrink-0 rounded-full border-2 ${
            step.status === "SUCCESS"
              ? "border-green-500 bg-green-100"
              : step.status === "FAILED"
                ? "border-red-500 bg-red-100"
                : "border-yellow-500 bg-yellow-100"
          }`}
        />

        <div className="min-w-0 flex-1">
          {/* Step header */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">#{step.stepNo}</span>
            <span className="font-medium text-sm">{step.skillName}</span>
            <Badge className={STEP_STATUS_COLORS[step.status] ?? ""} variant="secondary">
              {t(`agentTrace.stepStatus.${step.status}`)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {step.durationMs}{t("agentTrace.ms")} · {step.inputTokens + step.outputTokens} tokens
            </span>
          </div>

          {/* Error message */}
          {step.errorMessage && (
            <p className="mt-1 text-sm text-red-600">{step.errorMessage}</p>
          )}

          {/* Expand/Collapse button */}
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 h-6 px-2 text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "▼" : "▶"} {t("agentTrace.step.input")}/{t("agentTrace.step.output")}
          </Button>

          {/* JSON viewer */}
          {expanded && (
            <div className="mt-2 space-y-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t("agentTrace.step.input")}</p>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                  {JSON.stringify(step.input, null, 2)}
                </pre>
              </div>
              {step.output != null && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground">{t("agentTrace.step.output")}</p>
                  <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                    {JSON.stringify(step.output, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
