"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_COLORS: Record<string, string> = {
  NEW_ERROR: "bg-red-100 text-red-700",
  CORRECTED: "bg-blue-100 text-blue-700",
  REGRESSED: "bg-orange-100 text-orange-700",
};

export default function ParentReportsPage() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [selectedKpId, setSelectedKpId] = useState<string | null>(null);

  const { data: students } = trpc.family.students.useQuery();
  const effectiveStudentId = selectedStudentId || students?.[0]?.id || null;

  useEffect(() => {
    if (!selectedStudentId && students?.[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [selectedStudentId, students, setSelectedStudentId]);

  const { data: report, isLoading } = period === "7d"
    ? trpc.report.weeklyReport.useQuery(
        { studentId: effectiveStudentId! },
        { enabled: !!effectiveStudentId },
      )
    : trpc.report.monthlyReport.useQuery(
        { studentId: effectiveStudentId! },
        { enabled: !!effectiveStudentId },
      );

  if (!effectiveStudentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold">{t("report.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header + Period Toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("report.title")}</h1>
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {t(`report.period.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      )}

      {!isLoading && !report && (
        <p className="py-12 text-center text-muted-foreground">{t("report.noData")}</p>
      )}

      <KPProgressDialog
        knowledgePointId={selectedKpId}
        studentId={effectiveStudentId}
        open={!!selectedKpId}
        onClose={() => setSelectedKpId(null)}
      />

      {report && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              label={t("report.summary.newMastered")}
              value={report.summary.newMastered}
              color="text-green-600"
            />
            <SummaryCard
              label={t("report.summary.newRegressed")}
              value={report.summary.newRegressed}
              color="text-orange-600"
            />
            <SummaryCard
              label={t("report.summary.newErrors")}
              value={report.summary.newErrors}
              color="text-red-600"
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("report.summary.reviewCompletion")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.summary.reviewsScheduled > 0 ? (
                  <p className="text-2xl font-bold text-primary">
                    {Math.round(
                      (report.summary.reviewsCompleted /
                        report.summary.reviewsScheduled) *
                        100,
                    )}
                    %
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {report.summary.reviewsCompleted}/{report.summary.reviewsScheduled}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("report.summary.noReviewScheduled")}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Mastery Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>{t("report.trend.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={report.masteryTrend}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v: string) => v.slice(5)}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip
                    labelFormatter={(v) => String(v)}
                    formatter={(value) => [String(value), t("report.trend.mastered")]}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Weak Points Table */}
          <Card>
            <CardHeader>
              <CardTitle>{t("report.weakPoints.title")}</CardTitle>
            </CardHeader>
            <CardContent>
              {report.weakPoints.length === 0 ? (
                <p className="text-center text-muted-foreground">
                  {t("report.weakPoints.empty")}
                </p>
              ) : (
                <div className="space-y-3">
                  {report.weakPoints.map((wp) => (
                    <div
                      key={wp.knowledgePointId}
                      className="flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent/50"
                      onClick={() => setSelectedKpId(wp.knowledgePointId)}
                    >
                      <div>
                        <p className="font-medium">{wp.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t("mastery.subjects." + wp.subject)} ·{" "}
                          {t("report.weakPoints.attempts", { count: wp.totalAttempts })}
                        </p>
                      </div>
                      <Badge className={STATUS_COLORS[wp.status] ?? ""} variant="secondary">
                        {t("mastery.status." + wp.status)}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ─── KP Progress Dialog ─────────────────────────

function KPProgressDialog({
  knowledgePointId,
  studentId,
  open,
  onClose,
}: {
  knowledgePointId: string | null;
  studentId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { data, isLoading } = trpc.report.knowledgeProgress.useQuery(
    { studentId, knowledgePointId: knowledgePointId!, limit: 20 },
    { enabled: !!knowledgePointId },
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("report.progress.title")}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{data.mastery.knowledgePoint.name}</p>
              <Badge variant="secondary">{t(("mastery.status." + data.mastery.status) as never)}</Badge>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium">
                {t("report.progress.interventions")}
              </h3>
              {data.interventions.length === 0 ? (
                <p className="text-sm text-muted-foreground">-</p>
              ) : (
                <div className="space-y-2">
                  {data.interventions.map((iv) => (
                    <div key={iv.id} className="rounded border p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {t(("mastery.interventionType." + iv.type) as never)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(iv.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {iv.content && (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {typeof iv.content === "string" ? iv.content : JSON.stringify(iv.content)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
