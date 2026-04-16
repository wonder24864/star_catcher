"use client";

/**
 * Tier-adaptive score display.
 *
 * 4 visual styles:
 * - wonder: bounce counter (spring animation 0→value) + star decorations
 * - cosmic: hologram effect (glow text, scan-line animation, skew)
 * - flow: flip animation (rotateX enter/exit)
 * - studio: precise number + optional delta arrow (↑↓)
 */

import { useEffect } from "react";
import {
  motion,
  useSpring,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

export interface AdaptiveScoreProps {
  /** Score value (typically 0-100) */
  value: number;
  /** Total possible score (for display like "85/100") */
  total?: number;
  /** Score change delta for studio trend arrow */
  delta?: number;
  className?: string;
  tierOverride?: GradeTier;
}

// ---------------------------------------------------------------------------
// Wonder: bounce counter + stars
// ---------------------------------------------------------------------------

function WonderScore({ value, total, className }: { value: number; total?: number; className?: string }) {
  const spring = useSpring(0, { stiffness: 80, damping: 12 });
  const display = useTransform(spring, (v) => Math.round(v));

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  const stars = Math.max(1, Math.ceil(value / 25));

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <motion.span className="text-3xl font-bold text-primary">
        {display}
      </motion.span>
      {total != null && (
        <span className="text-lg text-muted-foreground">/{total}</span>
      )}
      <span className="ml-1" aria-hidden>
        {"⭐".repeat(Math.min(stars, 4))}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Cosmic: hologram effect
// ---------------------------------------------------------------------------

function CosmicScore({ value, total, className }: { value: number; total?: number; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1 backdrop-blur-sm",
        className,
      )}
    >
      {/* Scan line overlay */}
      <span
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg"
        aria-hidden
      >
        <span className="absolute inset-0 animate-[scan-line_2s_linear_infinite]" />
      </span>
      <span
        className="text-2xl font-bold"
        style={{
          textShadow: "0 0 12px oklch(0.6 0.22 290), 0 0 4px oklch(0.6 0.22 290 / 0.5)",
          transform: "skewY(-2deg)",
        }}
      >
        {value}
      </span>
      {total != null && (
        <span className="text-base text-muted-foreground">/{total}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Flow: flip animation
// ---------------------------------------------------------------------------

function FlowScore({ value, total, className }: { value: number; total?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} style={{ perspective: 200 }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={value}
          className="text-xl font-semibold tabular-nums"
          initial={{ rotateX: 90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: -90, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
      {total != null && (
        <span className="text-base text-muted-foreground">/{total}</span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Studio: precise number + delta indicator
// ---------------------------------------------------------------------------

function StudioScore({
  value,
  total,
  delta,
  className,
}: {
  value: number;
  total?: number;
  delta?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="font-medium tabular-nums">
        {value}
        {total != null && (
          <span className="text-muted-foreground">/{total}</span>
        )}
      </span>
      {delta != null && delta !== 0 && (
        <span
          className={cn(
            "text-xs font-medium",
            delta > 0 ? "text-green-600" : "text-red-500",
          )}
        >
          {delta > 0 ? "↑" : "↓"}
          {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdaptiveScore({
  value,
  total,
  delta,
  className,
  tierOverride,
}: AdaptiveScoreProps) {
  const { tier: contextTier } = useTier();
  const tier = tierOverride ?? contextTier;

  switch (tier) {
    case "wonder":
      return <WonderScore value={value} total={total} className={className} />;
    case "cosmic":
      return <CosmicScore value={value} total={total} className={className} />;
    case "flow":
      return <FlowScore value={value} total={total} className={className} />;
    case "studio":
      return <StudioScore value={value} total={total} delta={delta} className={className} />;
  }
}
