"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Sparkles,
  AlertOctagon,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GlassCard,
  GradientMesh,
  StatCard,
  GaugeChart,
  InteractiveChart,
} from "@/components/pro";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_COLORS: Record<string, string> = {
  NEW_ERROR: "bg-red-100 text-red-700",
  CORRECTED: "bg-blue-100 text-blue-700",
  REGRESSED: "bg-orange-100 text-orange-700",
};

// D61: mastery status → 0-100% for GaugeChart (ordinal / 3 * 100)
const MASTERY_PERCENT: Record<string, number> = {
  NEW_ERROR: 0,
  REGRESSED: 25,
  CORRECTED: 50,
  REVIEWING: 75,
  MASTERED: 100,
};

function masteryToPercent(status: string | null): number {
  if (status == null) return 0;
  return MASTERY_PERCENT[status] ?? 0;
}

export default function ParentReportsPage() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [isPeriodPending, startPeriodTransition] = useTransition();
  const [selectedKpId, setSelectedKpId] = useState<string | null>(null);

  const { data: students } = trpc.family.students.useQuery();
  const effectiveStudentId = selectedStudentId || students?.[0]?.id || null;

  useEffect(() => {
    if (!selectedStudentId && students?.[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [selectedStudentId, students, setSelectedStudentId]);

  const weekly = trpc.report.weeklyReport.useQuery(
    { studentId: effectiveStudentId! },
    { enabled: !!effectiveStudentId && period === "7d" },
  );
  const monthly = trpc.report.monthlyReport.useQuery(
    { studentId: effectiveStudentId! },
    { enabled: !!effectiveStudentId && period === "30d" },
  );
  const active = period === "7d" ? weekly : monthly;
  const report = active.data;
  const isLoading = active.isLoading;

  const { data: effectData, isLoading: effectLoading } =
    trpc.parent.interventionEffect.useQuery(
      { studentId: effectiveStudentId!, period },
      { enabled: !!effectiveStudentId },
    );

  if (!effectiveStudentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold">{t("report.title")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("homework.selectStudent")}
        </p>
      </div>
    );
  }

  const reviewRate =
    report && report.summary.reviewsScheduled > 0
      ? Math.round(
          (report.summary.reviewsCompleted /
            report.summary.reviewsScheduled) *
            100,
        )
      : 0;

  return (
    <div className="relative min-h-full">
      <GradientMesh className="rounded-xl" />

      <div className="relative max-w-4xl space-y-6">
        {/* Header + Period Toggle */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("report.title")}</h1>
          <div className="flex gap-2">
            {(["7d", "30d"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => startPeriodTransition(() => setPeriod(p))}
                disabled={isPeriodPending && period !== p}
              >
                {t(`report.period.${p}`)}
              </Button>
            ))}
          </div>
        </div>

        <KPProgressDialog
          knowledgePointId={selectedKpId}
          studentId={effectiveStudentId}
          open={!!selectedKpId}
          onClose={() => setSelectedKpId(null)}
        />

        {/* Summary Cards (4) */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            icon={Sparkles}
            label={t("report.summary.newMastered")}
            value={report?.summary.newMastered}
            loading={isLoading}
          />
          <StatCard
            icon={AlertOctagon}
            label={t("report.summary.newRegressed")}
            value={report?.summary.newRegressed}
            loading={isLoading}
          />
          <StatCard
            icon={AlertCircle}
            label={t("report.summary.newErrors")}
            value={report?.summary.newErrors}
            loading={isLoading}
          />
          <StatCard
            icon={CheckCircle2}
            label={t("report.summary.reviewCompletion")}
            loading={isLoading}
          >
            {report && report.summary.reviewsScheduled > 0 ? (
              <div className="flex items-center justify-center">
                <GaugeChart value={reviewRate} size={80} strokeWidth={7} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("report.summary.noReviewScheduled")}
              </p>
            )}
          </StatCard>
        </div>

        {/* Mastery Trend Chart */}
        <InteractiveChart
          title={t("report.trend.title")}
          loading={isLoading}
          empty={!report || report.masteryTrend.length === 0}
          emptyText={t("report.noData")}
        >
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={report?.masteryTrend ?? []}>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(v: string) => v.slice(5)}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
              <Tooltip
                labelFormatter={(v) => String(v)}
                formatter={(value) => [
                  String(value),
                  t("report.trend.mastered"),
                ]}
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
        </InteractiveChart>

        {/* Intervention Effect (D61, Sprint 25 new section) */}
        <GlassCard intensity="medium" glow="subtle" className="p-5">
          <div className="mb-4 flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold leading-none">
              {t("parent.intervention.effectTitle")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("parent.reports.interventionEffectHint")}
            </p>
          </div>

          {effectLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-xl" />
              ))}
            </div>
          ) : !effectData || effectData.effects.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("parent.intervention.emptyEffect")}
            </p>
          ) : (
            <div className="space-y-3">
              {effectData.effects.map((eff) => {
                const prePct = masteryToPercent(eff.preMastery);
                const postPct = masteryToPercent(eff.postMastery);
                const deltaColor =
                  eff.delta > 0
                    ? "text-green-600"
                    : eff.delta < 0
                      ? "text-red-600"
                      : "text-muted-foreground";
                const deltaSign =
                  eff.delta > 0 ? "+" : eff.delta < 0 ? "" : "±";
                return (
                  <GlassCard
                    key={eff.kpId}
                    intensity="subtle"
                    glow="none"
                    className="flex items-center gap-4 p-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{eff.kpName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(
                          ("mastery.interventionType." +
                            eff.interventionType) as never,
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <GaugeChart
                        value={prePct}
                        size={64}
                        strokeWidth={6}
                        label={t("parent.intervention.preMastery")}
                      />
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <GaugeChart
                        value={postPct}
                        size={64}
                        strokeWidth={6}
                        label={t("parent.intervention.postMastery")}
                      />
                      <span
                        className={`ml-2 text-sm font-semibold ${deltaColor}`}
                      >
                        {deltaSign}
                        {eff.delta}
                      </span>
                    </div>
                  </GlassCard>
                );
              })}
            </div>
          )}
        </GlassCard>

        {/* Weak Points */}
        <GlassCard intensity="medium" glow="subtle" className="p-5">
          <h2 className="mb-4 text-sm font-semibold">
            {t("report.weakPoints.title")}
          </h2>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : !report || report.weakPoints.length === 0 ? (
            <p className="text-center text-muted-foreground">
              {t("report.weakPoints.empty")}
            </p>
          ) : (
            <div className="space-y-3">
              {report.weakPoints.map((wp) => (
                <GlassCard
                  key={wp.knowledgePointId}
                  intensity="subtle"
                  glow="none"
                  className="cursor-pointer p-3"
                  onClick={() => setSelectedKpId(wp.knowledgePointId)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{wp.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("mastery.subjects." + wp.subject)} ·{" "}
                        {t("report.weakPoints.attempts", {
                          count: wp.totalAttempts,
                        })}
                      </p>
                    </div>
                    <Badge
                      className={STATUS_COLORS[wp.status] ?? ""}
                      variant="secondary"
                    >
                      {t("mastery.status." + wp.status)}
                    </Badge>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </GlassCard>

        {!isLoading && !report && (
          <p className="py-12 text-center text-muted-foreground">
            {t("report.noData")}
          </p>
        )}
      </div>
    </div>
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
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {data.mastery.knowledgePoint.name}
              </p>
              <Badge variant="secondary">
                {t(("mastery.status." + data.mastery.status) as never)}
              </Badge>
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
                    <GlassCard
                      key={iv.id}
                      intensity="subtle"
                      glow="none"
                      className="p-2"
                    >
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">
                          {t(("mastery.interventionType." + iv.type) as never)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(iv.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {iv.content != null && (
                        <p className="mt-1 text-muted-foreground text-xs">
                          {typeof iv.content === "string"
                            ? iv.content
                            : JSON.stringify(iv.content)}
                        </p>
                      )}
                    </GlassCard>
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
