"use client";

/**
 * Shared cumulative progress chart (D48).
 *
 * Renders a Recharts LineChart showing cumulative mastered vs total KPs
 * over a selectable period (30d / 90d). Tier-adaptive colors (D48):
 * - wonder: pink/orange (warm, playful)
 * - cosmic: cyan/purple (neon, tech)
 * - flow:   green/slate (clean, professional)
 * - studio: blue/gray   (restrained, precise)
 *
 * Used in: /student/profile page + /mastery page.
 */

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { trpc } from "@/lib/trpc/client";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// ─── Tier color mapping ────────────────────────

const TIER_COLORS: Record<GradeTier, { mastered: string; total: string }> = {
  wonder: { mastered: "#f472b6", total: "#fb923c" },
  cosmic: { mastered: "#22d3ee", total: "#a78bfa" },
  flow:   { mastered: "#34d399", total: "#94a3b8" },
  studio: { mastered: "#3b82f6", total: "#9ca3af" },
};

// ─── Component ─────────────────────────────────

interface HistoricalProgressChartProps {
  studentId: string | undefined;
  className?: string;
}

export function HistoricalProgressChart({
  studentId,
  className,
}: HistoricalProgressChartProps) {
  const [period, setPeriod] = useState<"30d" | "90d">("30d");
  const { tier } = useTier();
  const tP = useTierTranslations("learningProfile");
  const colors = TIER_COLORS[tier];

  const { data, isLoading } = trpc.profile.historicalProgress.useQuery(
    { studentId, period },
    { enabled: !!studentId },
  );

  const chartData = data?.dailyCounts ?? [];
  const isEmpty = !isLoading && chartData.length === 0;

  return (
    <AdaptiveCard className={cn("overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">
          {tP("progress.title")}
        </CardTitle>
        <div className="flex gap-1">
          <AdaptiveButton
            size="sm"
            variant={period === "30d" ? "default" : "outline"}
            onClick={() => setPeriod("30d")}
          >
            {tP("progress.period30d")}
          </AdaptiveButton>
          <AdaptiveButton
            size="sm"
            variant={period === "90d" ? "default" : "outline"}
            onClick={() => setPeriod("90d")}
          >
            {tP("progress.period90d")}
          </AdaptiveButton>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
            {tP("empty")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)} // MM-DD
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                strokeOpacity={0.3}
                width={32}
              />
              <Tooltip
                labelFormatter={(d) => String(d)}
                formatter={(value, name) => [
                  String(value),
                  name === "mastered" ? tP("progress.mastered") : tP("progress.total"),
                ]}
                contentStyle={{
                  borderRadius: 8,
                  fontSize: 12,
                  border: "1px solid var(--border)",
                }}
              />
              <Line
                type="monotone"
                dataKey="mastered"
                stroke={colors.mastered}
                strokeWidth={2}
                dot={false}
                name="mastered"
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke={colors.total}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                name="total"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </AdaptiveCard>
  );
}
