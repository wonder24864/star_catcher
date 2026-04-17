"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { AlertCircle, CheckSquare, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { SUBJECT_HEX_COLORS } from "@/lib/constants/subject-colors";
import { Button } from "@/components/ui/button";
import {
  GradientMesh,
  InteractiveChart,
  StatCard,
} from "@/components/pro";

interface ErrorTrendPoint {
  date: string;
  count: number;
}

export default function ParentStatsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const { data: students } = trpc.family.students.useQuery();
  const effectiveStudentId = selectedStudentId || students?.[0]?.id || null;

  useEffect(() => {
    if (!selectedStudentId && students?.[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [selectedStudentId, students, setSelectedStudentId]);

  const { data: stats, isLoading } = trpc.parent.stats.useQuery(
    { studentId: effectiveStudentId!, period },
    { enabled: !!effectiveStudentId },
  );
  const { data: corrDist, isLoading: corrLoading } =
    trpc.parent.correctionRateDistribution.useQuery(
      { studentId: effectiveStudentId!, period },
      { enabled: !!effectiveStudentId },
    );
  const { data: helpDetail, isLoading: helpLoading } =
    trpc.parent.helpFrequencyDetail.useQuery(
      { studentId: effectiveStudentId!, period },
      { enabled: !!effectiveStudentId },
    );

  if (!effectiveStudentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold">{t("parent.stats.title")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("homework.selectStudent")}
        </p>
      </div>
    );
  }

  // D59 drill-down: click on errorTrend Bar → navigate to overview for that day
  const [isDrillPending, startDrillTransition] = useTransition();
  const [isPeriodPending, startPeriodTransition] = useTransition();

  const handleErrorDayClick = (point: ErrorTrendPoint) => {
    if (!point?.date) return;
    startDrillTransition(() => {
      router.push(`/${locale}/parent/overview?date=${point.date}`);
    });
  };

  return (
    <div className="relative min-h-full">
      <GradientMesh className="rounded-xl" />

      <div className="relative max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("parent.stats.title")}</h1>
          <div className="flex gap-2">
            {(["7d", "30d"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => startPeriodTransition(() => setPeriod(p))}
                disabled={isPeriodPending && period !== p}
              >
                {t(`parent.stats.period.${p}`)}
              </Button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <StatCard
            icon={AlertCircle}
            label={t("parent.stats.totalErrors")}
            value={stats?.totalErrors}
            loading={isLoading}
          />
          <StatCard
            icon={CheckSquare}
            label={t("parent.stats.totalChecks")}
            value={stats?.totalChecks}
            loading={isLoading}
          />
        </div>

        {/* Charts grid */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Error trend by day — drill-down enabled */}
          <div className="relative">
            {isDrillPending && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/50 backdrop-blur-sm">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          <InteractiveChart
            title={t("parent.stats.errorTrend")}
            description={t("parent.stats.clickToView")}
            loading={isLoading}
            empty={!stats || stats.errorsByDay.length === 0}
            emptyText={t("common.noData")}
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={stats?.errorsByDay ?? []}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={(d) => String(d)}
                  formatter={(v) => [Number(v), t("parent.stats.errors")]}
                />
                <Bar
                  dataKey="count"
                  fill="#ef4444"
                  radius={[2, 2, 0, 0]}
                  cursor="pointer"
                  onClick={(data) =>
                    handleErrorDayClick(data as unknown as ErrorTrendPoint)
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </InteractiveChart>
          </div>

          {/* Subject distribution pie */}
          <InteractiveChart
            title={t("parent.stats.subjectDist")}
            loading={isLoading}
            empty={!stats || stats.subjectDistribution.length === 0}
            emptyText={t("common.noData")}
          >
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats?.subjectDistribution ?? []}
                  dataKey="count"
                  nameKey="subject"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  label={(props) => {
                    const p = props as unknown as {
                      subject?: string;
                      percent?: number;
                    };
                    return `${t(`homework.subjects.${p.subject ?? ""}`)} ${(
                      (p.percent ?? 0) * 100
                    ).toFixed(0)}%`;
                  }}
                  labelLine={false}
                >
                  {(stats?.subjectDistribution ?? []).map((entry) => (
                    <Cell
                      key={entry.subject}
                      fill={SUBJECT_HEX_COLORS[entry.subject] ?? "#6b7280"}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v, name) => [
                    Number(v),
                    t(`homework.subjects.${String(name)}`),
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </InteractiveChart>

          {/* Avg score trend */}
          <InteractiveChart
            title={t("parent.stats.avgScore")}
            loading={isLoading}
            empty={!stats || stats.avgScoreByDay.length === 0}
            emptyText={t("common.noData")}
          >
            <ResponsiveContainer width="100%" height={200}>
              <LineChart
                data={stats?.avgScoreByDay ?? []}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={(d) => String(d)}
                  formatter={(v) => [v ?? "-", t("parent.stats.score")]}
                />
                <Line
                  type="monotone"
                  dataKey="avgScore"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </InteractiveChart>

          {/* Check count trend */}
          <InteractiveChart
            title={t("parent.stats.checkCount")}
            loading={isLoading}
            empty={!stats || stats.checkCountByDay.length === 0}
            emptyText={t("common.noData")}
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={stats?.checkCountByDay ?? []}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => d.slice(5)}
                  tick={{ fontSize: 10 }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={(d) => String(d)}
                  formatter={(v) => [Number(v), t("parent.stats.checks")]}
                />
                <Bar dataKey="count" fill="#10b981" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </InteractiveChart>

          {/* Help frequency by subject (spans full width) */}
          <div className="lg:col-span-2">
            <InteractiveChart
              title={t("parent.stats.helpFreq")}
              loading={isLoading}
              empty={!stats || stats.helpFreqBySubject.length === 0}
              emptyText={t("common.noData")}
            >
              <ResponsiveContainer width="100%" height={180}>
                <BarChart
                  data={(stats?.helpFreqBySubject ?? []).map((d) => ({
                    ...d,
                    label: t(`homework.subjects.${d.subject}`),
                  }))}
                  margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                  layout="vertical"
                >
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 10 }}
                    width={52}
                  />
                  <Tooltip
                    formatter={(v) => [Number(v), t("parent.stats.helpCount")]}
                  />
                  <Bar
                    dataKey="count"
                    fill="#8b5cf6"
                    radius={[0, 2, 2, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </InteractiveChart>
          </div>
        </div>

        {/* Correction rate distribution */}
        <InteractiveChart
          title={t("parent.stats.correctionRate.title")}
          loading={corrLoading}
          empty={!corrDist || corrDist.bySubject.length === 0}
          emptyText={t("common.noData")}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={(corrDist?.bySubject ?? []).map((d) => ({
                ...d,
                label: t(`homework.subjects.${d.subject}`),
              }))}
              margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
            >
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="oneAttempt"
                name={t("parent.stats.correctionRate.oneAttempt")}
                fill="#10b981"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="twoAttempts"
                name={t("parent.stats.correctionRate.twoAttempts")}
                fill="#f59e0b"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="threeOrMore"
                name={t("parent.stats.correctionRate.threeOrMore")}
                fill="#ef4444"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </InteractiveChart>

        {/* Help frequency detail by level */}
        <InteractiveChart
          title={t("parent.stats.helpDetail.title")}
          loading={helpLoading}
          empty={!helpDetail || helpDetail.bySubject.length === 0}
          emptyText={t("common.noData")}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={(helpDetail?.bySubject ?? []).map((d) => ({
                ...d,
                label: t(`homework.subjects.${d.subject}`),
              }))}
              margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
            >
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                dataKey="L1"
                name={t("parent.stats.helpDetail.L1")}
                fill="#3b82f6"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="L2"
                name={t("parent.stats.helpDetail.L2")}
                fill="#f59e0b"
                radius={[2, 2, 0, 0]}
              />
              <Bar
                dataKey="L3"
                name={t("parent.stats.helpDetail.L3")}
                fill="#ef4444"
                radius={[2, 2, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </InteractiveChart>
      </div>
    </div>
  );
}
