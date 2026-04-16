"use client";

/**
 * CountUp — Animated number counter for Pro dashboards.
 *
 * Springs from 0 to `end` using framer-motion.
 * Starts when the element enters the viewport.
 * Respects prefers-reduced-motion (renders final value immediately).
 */

import { useEffect, useRef } from "react";
import { useSpring, useTransform, useInView, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

export interface CountUpProps {
  /** Target number */
  end: number;
  /** Animation duration in seconds */
  duration?: number;
  /** Text before the number */
  prefix?: string;
  /** Text after the number */
  suffix?: string;
  /** Decimal places */
  decimals?: number;
  /** Thousands separator */
  separator?: string;
  className?: string;
}

function formatNumber(value: number, decimals: number, separator: string): string {
  const fixed = value.toFixed(decimals);
  if (!separator) return fixed;

  const [intPart, decPart] = fixed.split(".");
  const withSep = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
  return decPart !== undefined ? `${withSep}.${decPart}` : withSep;
}

export function CountUp({
  end,
  duration = 2,
  prefix,
  suffix,
  decimals = 0,
  separator = ",",
  className,
}: CountUpProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const spring = useSpring(0, {
    duration: duration * 1000,
    bounce: 0,
  });

  const display = useTransform(spring, (v) =>
    formatNumber(v, decimals, separator),
  );

  useEffect(() => {
    if (isInView && !reduced) {
      spring.set(end);
    }
  }, [isInView, end, reduced, spring]);

  if (reduced) {
    return (
      <span ref={ref} className={cn("tabular-nums", className)}>
        {prefix}
        {formatNumber(end, decimals, separator)}
        {suffix}
      </span>
    );
  }

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}
