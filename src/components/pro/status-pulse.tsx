"use client";

/**
 * StatusPulse — Animated status indicator for Pro dashboards.
 *
 * Shows a colored dot with an optional pulsing ring.
 * Processing status gets a spinning border ring.
 * Respects prefers-reduced-motion.
 */

import { cva, type VariantProps } from "class-variance-authority";
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

const statusPulseVariants = cva("relative inline-flex items-center gap-2", {
  variants: {
    size: {
      sm: "",
      md: "",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const DOT_SIZE = { sm: "h-2 w-2", md: "h-2.5 w-2.5" } as const;
const PING_SIZE = { sm: "h-2 w-2", md: "h-2.5 w-2.5" } as const;

export type PulseStatus = "online" | "processing" | "idle" | "error";

export interface StatusPulseProps
  extends VariantProps<typeof statusPulseVariants> {
  status: PulseStatus;
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
  const sz = size ?? "md";

  return (
    <span className={cn(statusPulseVariants({ size }), className)}>
      <span className="relative flex">
        {/* Ping ring (animated) */}
        {!reduced && status !== "idle" && (
          <span
            className={cn(
              "absolute inline-flex rounded-full opacity-75",
              PING_SIZE[sz],
              PING_COLORS[status],
              status === "processing" ? "animate-spin border-2 border-transparent border-t-primary" : "animate-ping",
            )}
          />
        )}

        {/* Solid dot */}
        <span
          className={cn(
            "relative inline-flex rounded-full",
            DOT_SIZE[sz],
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
