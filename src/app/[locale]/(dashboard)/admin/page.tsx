"use client";

/**
 * Admin Dashboard — flagship Pro component showcase.
 *
 * Displays system-wide stats using Pro components:
 * GradientMesh background, StatCard summary cards (shared with parent
 * dashboards), GaugeChart mastery ring, StatusPulse system indicator,
 * GlassCard activity feed, Skeleton loading.
 */

import { useTranslations } from "next-intl";
import { Users, UserCheck, AlertCircle, Activity } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import {
  GlassCard,
  GaugeChart,
  StatusPulse,
  GradientMesh,
  StatCard,
} from "@/components/pro";
import { Skeleton } from "@/components/ui/skeleton";

function LogItem({
  action,
  target,
  admin,
  createdAt,
}: {
  action: string;
  target: string | null;
  admin: { nickname: string | null } | null;
  createdAt: Date;
}) {
  const time = new Date(createdAt).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg px-3 py-2 text-sm hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2 min-w-0">
        <StatusPulse status="idle" size="sm" />
        <span className="font-medium truncate">{action}</span>
        {target && (
          <span className="text-muted-foreground truncate text-xs">{target}</span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
        <span>{admin?.nickname ?? "System"}</span>
        <span>{time}</span>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const t = useTranslations("admin.dashboard");
  const { data, isLoading } = trpc.admin.dashboard.useQuery();

  return (
    <div className="relative min-h-full">
      {/* Background mesh */}
      <GradientMesh className="rounded-xl" />

      <div className="relative space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("systemStatus")}</p>
          </div>
          <StatusPulse status="online" label={t("online")} />
        </div>

        {/* Stat cards grid */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label={t("totalStudents")}
            value={data?.studentCount}
            loading={isLoading}
          />
          <StatCard
            icon={Activity}
            label={t("activeThisWeek")}
            value={data?.weeklyActiveSessions}
            loading={isLoading}
          />
          <StatCard
            icon={AlertCircle}
            label={t("totalErrors")}
            value={data?.totalErrors}
            loading={isLoading}
          />
          <StatCard
            icon={UserCheck}
            label={t("avgMastery")}
            loading={isLoading}
          >
            {data && (
              <div className="flex justify-center">
                <GaugeChart
                  value={data.avgMastery}
                  size={88}
                  strokeWidth={8}
                />
              </div>
            )}
          </StatCard>
        </div>

        {/* Recent Activity */}
        <GlassCard intensity="subtle" glow="subtle" className="p-5">
          <h2 className="mb-3 text-sm font-semibold">{t("recentActivity")}</h2>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data?.recentLogs.length ? (
            <div className="space-y-1">
              {data.recentLogs.map((log) => (
                <LogItem
                  key={log.id}
                  action={log.action}
                  target={log.target}
                  admin={log.admin}
                  createdAt={log.createdAt}
                />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("noActivity")}
            </p>
          )}
        </GlassCard>
      </div>
    </div>
  );
}
