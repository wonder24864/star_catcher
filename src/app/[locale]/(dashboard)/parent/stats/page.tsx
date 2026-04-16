"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
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
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { SUBJECT_HEX_COLORS } from "@/lib/constants/subject-colors";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ParentStatsPage() {
  const t = useTranslations();
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
    { enabled: !!effectiveStudentId }
  );
  const { data: corrDist } = trpc.parent.correctionRateDistribution.useQuery(
    { studentId: effectiveStudentId!, period },
    { enabled: !!effectiveStudentId }
  );
  const { data: helpDetail } = trpc.parent.helpFrequencyDetail.useQuery(
    { studentId: effectiveStudentId!, period },
    { enabled: !!effectiveStudentId }
  );

  if (!effectiveStudentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold">{t("parent.stats.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("parent.stats.title")}</h1>
        <div className="flex gap-2">
          {(["7d", "30d"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "default" : "outline"}
              onClick={() => setPeriod(p)}
            >
              {t(`parent.stats.period.${p}`)}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-3xl font-bold text-red-500">{stats.totalErrors}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("parent.stats.totalErrors")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 text-center">
              <p className="text-3xl font-bold text-blue-500">{stats.totalChecks}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("parent.stats.totalChecks")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {stats && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Error trend by day */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("parent.stats.errorTrend")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.errorsByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
                  <Bar dataKey="count" fill="#ef4444" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Subject distribution pie */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("parent.stats.subjectDist")}</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.subjectDistribution.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">{t("common.noData")}</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={stats.subjectDistribution}
                      dataKey="count"
                      nameKey="subject"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={(props) => {
                        const p = props as unknown as { subject?: string; percent?: number };
                        return `${t(`homework.subjects.${p.subject ?? ""}`)} ${((p.percent ?? 0) * 100).toFixed(0)}%`;
                      }}
                      labelLine={false}
                    >
                      {stats.subjectDistribution.map((entry) => (
                        <Cell
                          key={entry.subject}
                          fill={SUBJECT_HEX_COLORS[entry.subject] ?? "#6b7280"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [Number(v), t(`homework.subjects.${String(name)}`)]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Avg score trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("parent.stats.avgScore")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.avgScoreByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            </CardContent>
          </Card>

          {/* Check count trend */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("parent.stats.checkCount")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.checkCountByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            </CardContent>
          </Card>

          {/* Help frequency by subject */}
          {stats.helpFreqBySubject.length > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{t("parent.stats.helpFreq")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart
                    data={stats.helpFreqBySubject.map((d) => ({
                      ...d,
                      label: t(`homework.subjects.${d.subject}`),
                    }))}
                    margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                    layout="vertical"
                  >
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={52} />
                    <Tooltip formatter={(v) => [Number(v), t("parent.stats.helpCount")]} />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Correction rate distribution */}
      {corrDist && corrDist.bySubject.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("parent.stats.correctionRate.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={corrDist.bySubject.map((d) => ({
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
          </CardContent>
        </Card>
      )}

      {/* Help frequency detail by level */}
      {helpDetail && helpDetail.bySubject.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t("parent.stats.helpDetail.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={helpDetail.bySubject.map((d) => ({
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
