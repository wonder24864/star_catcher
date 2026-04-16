"use client";

/**
 * GradientMesh — Animated gradient mesh background for Pro dashboards.
 *
 * Multiple radial-gradient color blobs that slowly drift.
 * Uses CSS variables for automatic dark mode adaptation.
 * Respects prefers-reduced-motion (static gradient).
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const MESH_STYLE: React.CSSProperties = {
  background: [
    "radial-gradient(ellipse 80% 60% at 20% 30%, oklch(from var(--primary) l c h / 0.12) 0%, transparent 70%)",
    "radial-gradient(ellipse 70% 50% at 75% 20%, oklch(from var(--secondary) l c h / 0.10) 0%, transparent 65%)",
    "radial-gradient(ellipse 60% 70% at 50% 80%, oklch(from var(--accent) l c h / 0.08) 0%, transparent 60%)",
    "radial-gradient(ellipse 50% 40% at 85% 70%, oklch(from var(--primary) l c h / 0.06) 0%, transparent 55%)",
  ].join(", "),
};

const DARK_MESH_STYLE: React.CSSProperties = {
  background: [
    "radial-gradient(ellipse 80% 60% at 20% 30%, oklch(from var(--primary) l c h / 0.06) 0%, transparent 70%)",
    "radial-gradient(ellipse 70% 50% at 75% 20%, oklch(from var(--secondary) l c h / 0.05) 0%, transparent 65%)",
    "radial-gradient(ellipse 60% 70% at 50% 80%, oklch(from var(--accent) l c h / 0.04) 0%, transparent 60%)",
    "radial-gradient(ellipse 50% 40% at 85% 70%, oklch(from var(--primary) l c h / 0.03) 0%, transparent 55%)",
  ].join(", "),
};

export function GradientMesh({ className }: { className?: string }) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <>
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden",
            "dark:hidden",
            className,
          )}
          style={MESH_STYLE}
        />
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 overflow-hidden",
            "hidden dark:block",
            className,
          )}
          style={DARK_MESH_STYLE}
        />
      </>
    );
  }

  return (
    <>
      {/* Light mode mesh */}
      <motion.div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden",
          "dark:hidden",
          className,
        )}
        style={MESH_STYLE}
        animate={{
          backgroundPosition: [
            "20% 30%, 75% 20%, 50% 80%, 85% 70%",
            "30% 40%, 65% 30%, 40% 70%, 75% 60%",
            "25% 25%, 70% 25%, 55% 85%, 80% 75%",
            "20% 30%, 75% 20%, 50% 80%, 85% 70%",
          ],
        }}
        transition={{
          duration: 30,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "loop",
        }}
      />
      {/* Dark mode mesh (dimmer) */}
      <motion.div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 overflow-hidden",
          "hidden dark:block",
          className,
        )}
        style={DARK_MESH_STYLE}
        animate={{
          backgroundPosition: [
            "20% 30%, 75% 20%, 50% 80%, 85% 70%",
            "30% 40%, 65% 30%, 40% 70%, 75% 60%",
            "25% 25%, 70% 25%, 55% 85%, 80% 75%",
            "20% 30%, 75% 20%, 50% 80%, 85% 70%",
          ],
        }}
        transition={{
          duration: 30,
          ease: "easeInOut",
          repeat: Infinity,
          repeatType: "loop",
        }}
      />
    </>
  );
}
