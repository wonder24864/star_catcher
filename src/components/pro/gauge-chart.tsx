"use client";

/**
 * GaugeChart — Circular progress gauge for Pro dashboards.
 *
 * Pure SVG with framer-motion arc reveal animation.
 * Color bands: 0-40 destructive, 40-70 accent, 70-100 success.
 * Center shows animated percentage via CountUp.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { CountUp } from "./count-up";

export interface GaugeChartProps {
  /** Value 0-100 */
  value: number;
  /** SVG size in px */
  size?: number;
  /** Arc stroke width */
  strokeWidth?: number;
  /** Label below the percentage */
  label?: string;
  /** Show center value */
  showValue?: boolean;
  className?: string;
}

function getColorVar(value: number): string {
  if (value < 40) return "var(--destructive)";
  if (value < 70) return "var(--accent)";
  return "var(--success)";
}

function getGradientId(value: number): string {
  if (value < 40) return "gauge-grad-low";
  if (value < 70) return "gauge-grad-mid";
  return "gauge-grad-high";
}

export function GaugeChart({
  value: rawValue,
  size = 120,
  strokeWidth = 10,
  label,
  showValue = true,
  className,
}: GaugeChartProps) {
  const reduced = useReducedMotion();
  const value = Math.max(0, Math.min(100, rawValue));

  const { radius, circumference, offset } = useMemo(() => {
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const o = c - (value / 100) * c;
    return { radius: r, circumference: c, offset: o };
  }, [size, strokeWidth, value]);

  const center = size / 2;
  const color = getColorVar(value);
  const gradId = getGradientId(value);

  return (
    <div
      className={cn("relative inline-flex flex-col items-center", className)}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `${value}%`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="drop-shadow-[0_0_8px_var(--primary)/0.15]"
      >
        <defs>
          <linearGradient id="gauge-grad-low" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--destructive)" />
            <stop offset="100%" stopColor="var(--accent)" />
          </linearGradient>
          <linearGradient id="gauge-grad-mid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
          <linearGradient id="gauge-grad-high" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--secondary)" />
            <stop offset="100%" stopColor="var(--success)" />
          </linearGradient>
        </defs>

        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Foreground arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={reduced ? { strokeDashoffset: offset } : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={reduced ? { duration: 0 } : { duration: 1.5, ease: "easeOut" }}
          style={{
            transformOrigin: "center",
            transform: "rotate(-90deg)",
            filter: `drop-shadow(0 0 4px ${color})`,
          }}
        />
      </svg>

      {/* Center content */}
      {showValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold leading-none">
            {reduced ? (
              `${value}%`
            ) : (
              <CountUp end={value} duration={1.5} suffix="%" />
            )}
          </span>
          {label && (
            <span className="mt-0.5 text-xs text-muted-foreground">{label}</span>
          )}
        </div>
      )}
    </div>
  );
}
