"use client";

/**
 * StatusPulse — Animated status indicator for Pro dashboards.
 *
 * Shows a colored dot with an optional pulsing ring.
 * Processing status gets a spinning border ring.
 * Respects prefers-reduced-motion.
 */

import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const STATUS_COLORS = {
  online: "bg-success",
  processing: "bg-primary",
  idle: "bg-muted-foreground",
  error: "bg-destructive",
} as const;

const PING_COLORS = {
  online: "bg-success/60",
  processing: "bg-primary/60",
  idle: "bg-muted-foreground/40",
  error: "bg-destructive/60",
} as const;

const DOT_SIZE = { sm: "h-2 w-2", md: "h-2.5 w-2.5" } as const;

export type PulseStatus = "online" | "processing" | "idle" | "error";
export type PulseSize = "sm" | "md";

export interface StatusPulseProps {
  status: PulseStatus;
  size?: PulseSize;
  label?: string;
  className?: string;
}

export function StatusPulse({
  status,
  label,
  size = "md",
  className,
}: StatusPulseProps) {
  const reduced = useReducedMotion();

  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-2",
        className,
      )}
    >
      <span className="relative flex">
        {/* Ping ring (animated) */}
        {!reduced && status !== "idle" && (
          <span
            className={cn(
              "absolute inline-flex rounded-full opacity-75",
              DOT_SIZE[size],
              PING_COLORS[status],
              status === "processing"
                ? "animate-spin border-2 border-transparent border-t-primary"
                : "animate-ping",
            )}
          />
        )}

        {/* Solid dot */}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            DOT_SIZE[size],
            STATUS_COLORS[status],
          )}
        />
      </span>

      {label && (
        <span className="text-sm text-muted-foreground">{label}</span>
      )}
    </span>
  );
}
