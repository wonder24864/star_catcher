"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CheckCircle2, Target, AlertTriangle, HelpCircle } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/pro/glass-card";
import { GradientMesh } from "@/components/pro/gradient-mesh";
import { InteractiveChart } from "@/components/pro/interactive-chart";
import { CountUp } from "@/components/pro/count-up";

export default function ParentComparisonPage() {
  const t = useTranslations();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [isPending, startTransition] = useTransition();

  const { data, isLoading } = trpc.parent.multiStudentComparison.useQuery({ period });
  const students = data?.students ?? [];

  return (
    <div className="relative">
      <GradientMesh className="absolute inset-0 -z-10 rounded-xl" />
      <div className="relative max-w-5xl space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("parent.comparison.title")}</h1>
          <div className="flex gap-2">
            {(["7d", "30d"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={period === p ? "default" : "outline"}
                onClick={() => startTransition(() => setPeriod(p))}
                disabled={isPending && period !== p}
              >
                {t(`parent.stats.period.${p}`)}
              </Button>
            ))}
          </div>
        </div>

        {isLoading && (
          <p className="text-muted-foreground">{t("common.loading")}</p>
        )}

        {!isLoading && students.length === 0 && (
          <GlassCard intensity="subtle" glow="none" className="p-12 text-center">
            <p className="text-muted-foreground">
              {t("parent.comparison.noStudents")}
            </p>
          </GlassCard>
        )}

        {!isLoading && students.length === 1 && (
          <p className="text-sm text-muted-foreground">
            {t("parent.comparison.singleStudent")}
          </p>
        )}

        {students.length > 0 && (
          <>
            {/* Per-student metric cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {students.map((s, i) => (
                <motion.div
                  key={s.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                >
                  <GlassCard intensity="medium" glow="subtle" className="p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="font-semibold">{s.name}</div>
                      <span className="text-xs text-muted-foreground">
                        {s.errorCount} {t("parent.comparison.problems")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-background/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          {t("parent.comparison.correctionRate")}
                        </div>
                        <div className="text-xl font-bold">
                          <CountUp
                            end={Math.round(s.correctionRate * 100)}
                            suffix="%"
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border bg-background/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Target className="h-3.5 w-3.5 text-blue-500" />
                          {t("parent.comparison.masteryRate")}
                        </div>
                        <div className="text-xl font-bold">
                          <CountUp
                            end={Math.round(s.masteryRate * 100)}
                            suffix="%"
                          />
                        </div>
                      </div>
                      <div className="rounded-lg border bg-background/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                          {t("parent.comparison.errorCount")}
                        </div>
                        <div className="text-xl font-bold">
                          <CountUp end={s.errorCount} />
                        </div>
                      </div>
                      <div className="rounded-lg border bg-background/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <HelpCircle className="h-3.5 w-3.5 text-purple-500" />
                          {t("parent.comparison.helpFrequency")}
                        </div>
                        <div className="text-xl font-bold">
                          <CountUp end={s.helpFrequency} />
                        </div>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>

            {/* Comparison charts */}
            <div className="grid gap-6 lg:grid-cols-2">
              <InteractiveChart
                title={t("parent.comparison.ratesChart")}
                loading={isLoading || isPending}
                empty={students.length === 0}
                emptyText={t("parent.comparison.empty")}
              >
                <ResponsiveContainer width="100%" height={240}>
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
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey={t("parent.comparison.masteryRate")}
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </InteractiveChart>

              <InteractiveChart
                title={t("parent.comparison.countsChart")}
                loading={isLoading || isPending}
                empty={students.length === 0}
                emptyText={t("parent.comparison.empty")}
              >
                <ResponsiveContainer width="100%" height={240}>
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
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey={t("parent.comparison.helpFrequency")}
                      fill="#8b5cf6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </InteractiveChart>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
