"use client";

/**
 * InteractiveChart — Enhanced chart container for Pro dashboards.
 *
 * Wraps recharts children in a GlassCard with loading/empty states.
 * Supports drill-down callback on chart click.
 * AnimatePresence transitions between loading/empty/content.
 */

import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "./glass-card";
import { Skeleton } from "@/components/ui/skeleton";

export interface InteractiveChartProps {
  /** recharts chart as children */
  children: ReactNode;
  /** Card header title */
  title: string;
  /** Card header description */
  description?: string;
  /** Show loading skeleton */
  loading?: boolean;
  /** Show empty state */
  empty?: boolean;
  /** Empty state message */
  emptyText?: string;
  /** Empty state icon (defaults to BarChart3) */
  emptyIcon?: ReactNode;
  /** Callback when a chart element is clicked */
  onDrillDown?: (data: unknown) => void;
  className?: string;
}

const fadeVariants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
};

export function InteractiveChart({
  children,
  title,
  description,
  loading,
  empty,
  emptyText = "No data available",
  emptyIcon,
  onDrillDown,
  className,
}: InteractiveChartProps) {
  return (
    <GlassCard
      intensity="medium"
      glow="subtle"
      className={cn("flex flex-col gap-4 p-5", className)}
    >
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>

      {/* Content area */}
      <div className="relative min-h-[200px]">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              className="flex flex-col gap-3"
              {...fadeVariants}
              transition={{ duration: 0.15 }}
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </motion.div>
          ) : empty ? (
            <motion.div
              key="empty"
              className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground"
              {...fadeVariants}
              transition={{ duration: 0.15 }}
            >
              <span className="text-3xl opacity-40">
                {emptyIcon ?? <BarChart3 className="h-8 w-8" />}
              </span>
              <span className="text-sm">{emptyText}</span>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              {...fadeVariants}
              transition={{ duration: 0.15 }}
              onClick={(e) => {
                // recharts attaches data on the native event via activePayload
                const target = e.target as HTMLElement;
                const payload = target?.dataset?.payload;
                if (payload && onDrillDown) {
                  try {
                    onDrillDown(JSON.parse(payload));
                  } catch {
                    // non-parseable payload, ignore
                  }
                }
              }}
              className={onDrillDown ? "cursor-pointer" : undefined}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
