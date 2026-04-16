"use client";

/**
 * Tier-adaptive progress indicator.
 *
 * 4 visual styles:
 * - wonder: rainbow gradient bar
 * - cosmic: constellation dots (SVG)
 * - flow: gradient ring (SVG circle)
 * - studio: thin line + percentage text
 */

import { useId } from "react";
import { cn } from "@/lib/utils";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

export interface AdaptiveProgressProps {
  /** 0-100 */
  value: number;
  /** Total steps for cosmic constellation view */
  total?: number;
  className?: string;
  tierOverride?: GradeTier;
}

// ---------------------------------------------------------------------------
// Wonder: rainbow gradient bar
// ---------------------------------------------------------------------------

function WonderBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("h-4 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{
          width: `${value}%`,
          background: "linear-gradient(90deg, #FF6B6B 0%, #FFE66D 25%, #4ECDC4 50%, #74B9FF 75%, #FF9FF3 100%)",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cosmic: constellation dots + connecting lines
// ---------------------------------------------------------------------------

function CosmicConstellation({
  value,
  total = 5,
  className,
}: {
  value: number;
  total?: number;
  className?: string;
}) {
  const filled = Math.round((value / 100) * total);
  const dotRadius = 5;
  const spacing = 40;
  const width = (total - 1) * spacing + dotRadius * 4;
  const height = 30;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn("w-full", className)}
      aria-label={`${value}%`}
      role="progressbar"
      aria-valuenow={value}
    >
      {/* Connecting lines */}
      {Array.from({ length: total - 1 }, (_, i) => (
        <line
          key={`line-${i}`}
          x1={dotRadius * 2 + i * spacing}
          y1={height / 2}
          x2={dotRadius * 2 + (i + 1) * spacing}
          y2={height / 2}
          stroke={i < filled - 1 ? "oklch(0.6 0.22 290)" : "oklch(0.35 0.04 270)"}
          strokeWidth={1.5}
          strokeDasharray={i < filled - 1 ? "none" : "3 3"}
        />
      ))}
      {/* Dots */}
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={`dot-${i}`}
          cx={dotRadius * 2 + i * spacing}
          cy={height / 2}
          r={dotRadius}
          fill={i < filled ? "oklch(0.6 0.22 290)" : "oklch(0.25 0.03 270)"}
          className={i < filled ? "drop-shadow-[0_0_4px_oklch(0.6_0.22_290)]" : ""}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Flow: gradient ring
// ---------------------------------------------------------------------------

function FlowRing({ value, className }: { value: number; className?: string }) {
  const gradientId = useId();
  const size = 48;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="oklch(0.93 0.003 264)"
          strokeWidth={strokeWidth}
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500 ease-out"
        />
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="oklch(0.55 0.2 285)" />
            <stop offset="100%" stopColor="oklch(0.68 0.15 165)" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-xs font-medium">{value}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Studio: thin line + percentage
// ---------------------------------------------------------------------------

function StudioBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AdaptiveProgress({
  value,
  total,
  className,
  tierOverride,
}: AdaptiveProgressProps) {
  const { tier: contextTier } = useTier();
  const tier = tierOverride ?? contextTier;
  const clamped = Math.max(0, Math.min(100, value));

  switch (tier) {
    case "wonder":
      return <WonderBar value={clamped} className={className} />;
    case "cosmic":
      return <CosmicConstellation value={clamped} total={total} className={className} />;
    case "flow":
      return <FlowRing value={clamped} className={className} />;
    case "studio":
      return <StudioBar value={clamped} className={className} />;
  }
}
