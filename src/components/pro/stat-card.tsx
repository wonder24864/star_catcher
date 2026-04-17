"use client";

/**
 * StatCard — Shared summary metric card for Pro dashboards.
 *
 * Extracted from admin/page.tsx (Sprint 24) to be reused across admin + parent
 * dashboards (Sprint 25). Displays an icon + label + numeric value (CountUp) or
 * custom children (e.g. embedded GaugeChart), with Skeleton loading state.
 */

import type { ComponentType, ReactNode } from "react";
import { GlassCard } from "./glass-card";
import { CountUp } from "./count-up";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value?: number;
  loading?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  children,
  className,
}: StatCardProps) {
  return (
    <GlassCard
      intensity="medium"
      glow="subtle"
      className={cn("flex flex-col gap-3 p-5", className)}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : children ? (
        children
      ) : (
        <span className="text-2xl font-bold">
          <CountUp end={value ?? 0} />
        </span>
      )}
    </GlassCard>
  );
}
