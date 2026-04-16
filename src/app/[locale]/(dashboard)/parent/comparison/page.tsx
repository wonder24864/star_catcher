"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { trpc } from "@/lib/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ParentComparisonPage() {
  const t = useTranslations();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const { data, isLoading } = trpc.parent.multiStudentComparison.useQuery({ period });
  const students = data?.students ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("parent.comparison.title")}</h1>
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

      {isLoading && <p className="text-muted-foreground">{t("common.loading")}</p>}

      {!isLoading && students.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">
          {t("parent.comparison.noStudents")}
        </p>
      )}

      {!isLoading && students.length === 1 && (
        <p className="text-sm text-muted-foreground">
          {t("parent.comparison.singleStudent")}
        </p>
      )}

      {students.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Rates chart: correctionRate + masteryRate (0-100%) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("parent.comparison.ratesChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={students.map((s) => ({
                    name: s.name,
                    [t("parent.comparison.correctionRate")]: Math.round(s.correctionRate * 100),
                    [t("parent.comparison.masteryRate")]: Math.round(s.masteryRate * 100),
                  }))}
                  margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v) => [`${Number(v)}%`]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey={t("parent.comparison.correctionRate")}
                    fill="#10b981"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey={t("parent.comparison.masteryRate")}
                    fill="#3b82f6"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Counts chart: errorCount + helpFrequency */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("parent.comparison.countsChart")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={students.map((s) => ({
                    name: s.name,
                    [t("parent.comparison.errorCount")]: s.errorCount,
                    [t("parent.comparison.helpFrequency")]: s.helpFrequency,
                  }))}
                  margin={{ top: 4, right: 4, left: -10, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar
                    dataKey={t("parent.comparison.errorCount")}
                    fill="#ef4444"
                    radius={[2, 2, 0, 0]}
                  />
                  <Bar
                    dataKey={t("parent.comparison.helpFrequency")}
                    fill="#8b5cf6"
                    radius={[2, 2, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
