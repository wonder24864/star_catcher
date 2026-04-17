"use client";

/**
 * GradientMesh — Animated gradient mesh background for Pro dashboards.
 *
 * Multiple radial-gradient color blobs that slowly drift via transform.
 * Uses CSS variables for automatic dark mode adaptation.
 * Respects prefers-reduced-motion (static gradient).
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

/** Light mode mesh: 4 layered radial gradients keyed off CSS variables. */
const MESH_STYLE: React.CSSProperties = {
  background: [
    "radial-gradient(ellipse 80% 60% at 20% 30%, oklch(from var(--primary) l c h / 0.12) 0%, transparent 70%)",
    "radial-gradient(ellipse 70% 50% at 75% 20%, oklch(from var(--secondary) l c h / 0.10) 0%, transparent 65%)",
    "radial-gradient(ellipse 60% 70% at 50% 80%, oklch(from var(--accent) l c h / 0.08) 0%, transparent 60%)",
    "radial-gradient(ellipse 50% 40% at 85% 70%, oklch(from var(--primary) l c h / 0.06) 0%, transparent 55%)",
  ].join(", "),
};

/** Dark mode mesh: lower opacity for better text contrast over dark bg. */
const DARK_MESH_STYLE: React.CSSProperties = {
  background: [
    "radial-gradient(ellipse 80% 60% at 20% 30%, oklch(from var(--primary) l c h / 0.06) 0%, transparent 70%)",
    "radial-gradient(ellipse 70% 50% at 75% 20%, oklch(from var(--secondary) l c h / 0.05) 0%, transparent 65%)",
    "radial-gradient(ellipse 60% 70% at 50% 80%, oklch(from var(--accent) l c h / 0.04) 0%, transparent 60%)",
    "radial-gradient(ellipse 50% 40% at 85% 70%, oklch(from var(--primary) l c h / 0.03) 0%, transparent 55%)",
  ].join(", "),
};

const DRIFT_ANIMATION = {
  // Slow translate + rotate to create organic drift. Works reliably with
  // composited transforms (unlike backgroundPosition on the shorthand).
  x: ["0%", "2%", "-1%", "0%"],
  y: ["0%", "-1%", "2%", "0%"],
  rotate: [0, 0.4, -0.3, 0],
};

const DRIFT_TRANSITION = {
  duration: 30,
  ease: "easeInOut" as const,
  repeat: Infinity,
  repeatType: "loop" as const,
};

export function GradientMesh({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  const baseClasses = cn(
    "pointer-events-none absolute inset-0 overflow-hidden",
    className,
  );

  if (reduced) {
    // Static: single node switches background via Tailwind's dark: — we emit
    // two nodes keyed off dark: toggle because the style object itself cannot
    // change per theme without extra runtime plumbing.
    return (
      <>
        <div aria-hidden="true" className={cn(baseClasses, "dark:hidden")} style={MESH_STYLE} />
        <div aria-hidden="true" className={cn(baseClasses, "hidden dark:block")} style={DARK_MESH_STYLE} />
      </>
    );
  }

  return (
    <>
      <motion.div
        aria-hidden="true"
        className={cn(baseClasses, "dark:hidden")}
        style={MESH_STYLE}
        animate={DRIFT_ANIMATION}
        transition={DRIFT_TRANSITION}
      />
      <motion.div
        aria-hidden="true"
        className={cn(baseClasses, "hidden dark:block")}
        style={DARK_MESH_STYLE}
        animate={DRIFT_ANIMATION}
        transition={DRIFT_TRANSITION}
      />
    </>
  );
}
