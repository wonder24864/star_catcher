"use client";

/**
 * Admin /eval — AI Quality Evaluation dashboard (Sprint 16 US-058).
 *
 * Two tabs:
 *   1. Datasets    — per-operation case counts + last-run status + "Run" action
 *   2. Run History — EvalRun list, click row to inspect per-case results
 *
 * Data flows:
 *   - trpc.eval.datasetStats → per-op dataset health
 *   - trpc.eval.listRuns     → paginated EvalRun summary
 *   - trpc.eval.getRun       → detailed cases for one run
 *   - trpc.eval.trigger      → enqueue BullMQ eval-run, returns { runId, jobId }
 */

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import type { AIOperationType } from "@prisma/client";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Tab = "datasets" | "runs";
type EvalCaseStatus = "PASS" | "FAIL" | "ERROR" | "SKIPPED";
type EvalRunStatus = "RUNNING" | "COMPLETED" | "FAILED";

function formatDateTime(d: Date | string | null | undefined, locale: string): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 100) / 10;
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  return `${m}m${rs}s`;
}

function statusBadgeVariant(s: EvalCaseStatus | EvalRunStatus): "default" | "destructive" | "secondary" | "outline" {
  if (s === "PASS" || s === "COMPLETED") return "default";
  if (s === "FAIL" || s === "FAILED") return "destructive";
  if (s === "ERROR") return "destructive";
  if (s === "SKIPPED") return "outline";
  return "secondary"; // RUNNING
}

export default function EvalPage() {
  const t = useTranslations("admin.eval");
  const tStatus = useTranslations("admin.eval.status");
  const [tab, setTab] = useState<Tab>("datasets");

  return (
    <div className="max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        {(["datasets", "runs"] as Tab[]).map((tk) => (
          <Button
            key={tk}
            variant={tab === tk ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(tk)}
          >
            {t(`tabs.${tk}`)}
          </Button>
        ))}
      </div>

      {tab === "datasets" && <DatasetsTab tStatus={tStatus} />}
      {tab === "runs" && <RunsTab tStatus={tStatus} />}
    </div>
  );
}

// ─── Datasets Tab ─────────────────────────────────────────────────────

function DatasetsTab({ tStatus }: { tStatus: (key: string) => string }) {
  const t = useTranslations("admin.eval");
  const tActions = useTranslations("admin.eval.actions");
  const tCols = useTranslations("admin.eval.datasetsTable");
  const locale = useLocale();
  const utils = trpc.useUtils();

  const { data: stats, isLoading } = trpc.eval.datasetStats.useQuery();
  const trigger = trpc.eval.trigger.useMutation({
    onSuccess: () => {
      utils.eval.datasetStats.invalidate();
      utils.eval.listRuns.invalidate();
      alert(t("triggerSuccess"));
    },
    onError: (e) => alert(t("triggerFailed", { message: e.message })),
  });

  const handleRunAll = () => {
    if (!confirm(t("confirmRun"))) return;
    trigger.mutate({});
  };

  const handleRunOne = (operation: AIOperationType) => {
    if (!confirm(t("confirmRun"))) return;
    trigger.mutate({ operations: [operation] });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("pending")}</div>;
  }

  const totalCases = stats?.reduce((sum, s) => sum + s.caseCount, 0) ?? 0;
  const evaluableOps = stats?.filter((s) => s.caseCount > 0).length ?? 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("summary.totalDatasets")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground">
              {evaluableOps} evaluable
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">{t("summary.totalCases")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCases}</div>
          </CardContent>
        </Card>
        <Card className="flex flex-col justify-center">
          <CardContent className="pt-6">
            <Button onClick={handleRunAll} disabled={trigger.isPending} className="w-full">
              {tActions("runAll")}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Datasets table */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-3">{tCols("operation")}</th>
                <th className="p-3">{tCols("caseCount")}</th>
                <th className="p-3">{tCols("lastStatus")}</th>
                <th className="p-3">{tCols("lastAt")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {stats?.map((row) => {
                const unavailable = row.caseCount === 0;
                return (
                  <tr key={row.operation} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-mono">{row.operation}</td>
                    <td className="p-3">
                      {unavailable ? (
                        <Badge variant="outline">{tCols("unavailable")}</Badge>
                      ) : (
                        row.caseCount
                      )}
                    </td>
                    <td className="p-3">
                      {row.lastCaseStatus ? (
                        <Badge variant={statusBadgeVariant(row.lastCaseStatus as EvalCaseStatus)}>
                          {tStatus(row.lastCaseStatus)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatDateTime(row.lastCaseAt, locale)}
                    </td>
                    <td className="p-3">
                      {unavailable ? (
                        <span
                          className="text-xs text-muted-foreground"
                          title={row.unavailableReason ?? ""}
                        >
                          {tCols("reason")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRunOne(row.operation as AIOperationType)}
                          disabled={trigger.isPending}
                        >
                          {tActions("runOne")}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Runs Tab ─────────────────────────────────────────────────────────

function RunsTab({ tStatus }: { tStatus: (key: string) => string }) {
  const t = useTranslations("admin.eval");
  const tCols = useTranslations("admin.eval.runsTable");
  const tActions = useTranslations("admin.eval.actions");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const { data, isLoading } = trpc.eval.listRuns.useQuery({ page, pageSize: 20 });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t("pending")}</div>;
  }

  if (selectedRunId) {
    return (
      <RunDetail
        runId={selectedRunId}
        onBack={() => setSelectedRunId(null)}
        tStatus={tStatus}
      />
    );
  }

  if (!data || data.items.length === 0) {
    return <div className="text-sm text-muted-foreground">{t("empty")}</div>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr className="text-left">
              <th className="p-3">{tCols("startedAt")}</th>
              <th className="p-3">{tCols("triggeredBy")}</th>
              <th className="p-3">{tCols("status")}</th>
              <th className="p-3">{tCols("totals")}</th>
              <th className="p-3">{tCols("passRate")}</th>
              <th className="p-3">{tCols("duration")}</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((r) => {
              const duration =
                r.completedAt && r.startedAt
                  ? new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()
                  : null;
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3">{formatDateTime(r.startedAt, locale)}</td>
                  <td className="p-3">{r.admin.nickname}</td>
                  <td className="p-3">
                    <Badge variant={statusBadgeVariant(r.status)}>
                      {tStatus(r.status)}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs">
                    {r.passedCases}/{r.totalCases}
                    <span className="text-muted-foreground ml-1">
                      ({r.failedCases}f {r.erroredCases}e {r.skippedCases}s)
                    </span>
                  </td>
                  <td className="p-3">
                    {r.passRate != null ? `${Math.round(r.passRate * 100)}%` : "—"}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {formatDuration(duration)}
                  </td>
                  <td className="p-3">
                    <Button size="sm" variant="outline" onClick={() => setSelectedRunId(r.id)}>
                      {tActions("viewDetails")}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Pagination */}
        <div className="flex items-center justify-between border-t p-3 text-sm">
          <div>
            {data.total} total · page {data.page}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              ‹
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={page * data.pageSize >= data.total}
            >
              ›
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Run Detail ───────────────────────────────────────────────────────

function RunDetail({
  runId,
  onBack,
  tStatus,
}: {
  runId: string;
  onBack: () => void;
  tStatus: (key: string) => string;
}) {
  const t = useTranslations("admin.eval");
  const tDetail = useTranslations("admin.eval.detail");
  const locale = useLocale();
  const [showPassed, setShowPassed] = useState(false);

  const { data: run, isLoading } = trpc.eval.getRun.useQuery({ id: runId });

  if (isLoading || !run) {
    return <div className="text-sm text-muted-foreground">{t("pending")}</div>;
  }

  // Group cases by operation
  const groups = new Map<string, typeof run.cases>();
  for (const c of run.cases) {
    const arr = groups.get(c.operation) ?? [];
    arr.push(c);
    groups.set(c.operation, arr);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{tDetail("title")}</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowPassed((v) => !v)}>
            {showPassed ? tDetail("hidePassed") : tDetail("showPassed")}
          </Button>
          <Button size="sm" variant="outline" onClick={onBack}>
            {tDetail("back")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-1 text-sm">
          <div>
            {tDetail("casesSummary", {
              passed: run.passedCases,
              total: run.totalCases,
              failed: run.failedCases,
              errored: run.erroredCases,
              skipped: run.skippedCases,
            })}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDateTime(run.startedAt, locale)} · {run.admin.nickname}
          </div>
        </CardContent>
      </Card>

      {Array.from(groups.entries()).map(([op, cases]) => {
        const visibleCases = showPassed ? cases : cases.filter((c) => c.status !== "PASS");
        if (visibleCases.length === 0 && !showPassed) return null;
        return (
          <Card key={op}>
            <CardHeader>
              <CardTitle className="text-base font-mono">
                {tDetail("operationGroup", { op })}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {visibleCases.map((c) => (
                <div key={c.id} className="border-l-4 pl-3 text-sm" style={{ borderColor: borderColor(c.status as EvalCaseStatus) }}>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusBadgeVariant(c.status as EvalCaseStatus)}>
                      {tStatus(c.status)}
                    </Badge>
                    <span className="font-mono text-xs">{c.caseId}</span>
                    {c.judgeScore != null && (
                      <span className="text-xs text-muted-foreground">
                        · {tDetail("judgeScore")}: {c.judgeScore}/5
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      · {formatDuration(c.durationMs)}
                    </span>
                  </div>
                  {c.failureReason && (
                    <div className="mt-1 text-xs text-destructive">
                      {tDetail("failureReason")}: {c.failureReason}
                    </div>
                  )}
                  {c.judgeReasoning && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {tDetail("judgeReasoning")}: {c.judgeReasoning}
                    </div>
                  )}
                  {(c.status === "FAIL" || c.status === "ERROR") && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-muted-foreground">
                        {tDetail("expectedLabel")} / {tDetail("actualLabel")}
                      </summary>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <pre className="overflow-x-auto rounded bg-muted p-2">
                          {JSON.stringify(c.expected, null, 2)}
                        </pre>
                        <pre className="overflow-x-auto rounded bg-muted p-2">
                          {JSON.stringify(c.actual, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function borderColor(status: EvalCaseStatus): string {
  switch (status) {
    case "PASS":
      return "#22c55e";
    case "FAIL":
      return "#ef4444";
    case "ERROR":
      return "#f59e0b";
    case "SKIPPED":
    default:
      return "#94a3b8";
  }
}
