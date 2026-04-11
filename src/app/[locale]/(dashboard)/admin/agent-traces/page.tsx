"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_COLORS: Record<string, string> = {
  RUNNING: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  TERMINATED: "bg-yellow-100 text-yellow-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function AgentTracesPage() {
  const t = useTranslations();
  const [page, setPage] = useState(1);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data, isLoading } = trpc.agentTrace.list.useQuery({
    page,
    agentName: agentFilter === "all" ? undefined : agentFilter,
    status: statusFilter === "all" ? undefined : statusFilter as "RUNNING" | "COMPLETED" | "TERMINATED" | "FAILED",
  });

  const { data: stats } = trpc.agentTrace.stats.useQuery();

  return (
    <div className="max-w-5xl space-y-6">
      <h1 className="text-2xl font-bold">{t("agentTrace.title")}</h1>

      {/* Stats Cards */}
      {stats && stats.byAgent.length > 0 && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.byAgent.map((a) => (
            <Card key={a.agentName}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{a.agentName}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>{t("agentTrace.stats.totalCalls")}: {a.totalCalls}</p>
                <p>{t("agentTrace.stats.successRate")}: {a.successRate}%</p>
                <p>{t("agentTrace.stats.avgDuration")}: {a.avgDurationMs}{t("agentTrace.ms")}</p>
                <p>{t("agentTrace.stats.avgTokens")}: {a.avgTokens}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={agentFilter} onValueChange={setAgentFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("agentTrace.filter.allAgents")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("agentTrace.filter.allAgents")}</SelectItem>
            <SelectItem value="diagnosis">diagnosis</SelectItem>
            <SelectItem value="question-understanding">question-understanding</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("agentTrace.filter.allStatuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("agentTrace.filter.allStatuses")}</SelectItem>
            {(["RUNNING", "COMPLETED", "TERMINATED", "FAILED"] as const).map((s) => (
              <SelectItem key={s} value={s}>{t(`agentTrace.status.${s}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Trace List */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && (!data || data.traces.length === 0) && (
        <p className="py-12 text-center text-muted-foreground">{t("agentTrace.list.empty")}</p>
      )}

      {data && data.traces.length > 0 && (
        <div className="space-y-2">
          {data.traces.map((trace) => (
            <Link
              key={trace.id}
              href={`/admin/agent-traces/${trace.id}`}
              className="block rounded-lg border p-4 transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium">{trace.agentName}</span>
                  <Badge className={STATUS_COLORS[trace.status] ?? ""} variant="secondary">
                    {t(`agentTrace.status.${trace.status}`)}
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {new Date(trace.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="mt-2 flex gap-4 text-sm text-muted-foreground">
                <span>{t("agentTrace.list.user")}: {trace.user.nickname || trace.user.username}</span>
                <span>{t("agentTrace.list.steps")}: {trace.totalSteps}</span>
                <span>{t("agentTrace.list.tokens")}: {trace.totalInputTokens + trace.totalOutputTokens}</span>
                <span>{t("agentTrace.list.duration")}: {trace.totalDurationMs}{t("agentTrace.ms")}</span>
              </div>
            </Link>
          ))}

          {/* Pagination */}
          {data.total > data.limit && (
            <div className="flex justify-center gap-2 pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ←
              </Button>
              <span className="flex items-center text-sm text-muted-foreground">
                {page} / {Math.ceil(data.total / data.limit)}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page * data.limit >= data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
