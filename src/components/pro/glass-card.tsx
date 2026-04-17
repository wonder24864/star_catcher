"use client";

/**
 * GlassCard — Frosted glass card for Pro dashboards.
 *
 * Uses backdrop-blur + semi-transparent background.
 * Supports light/dark mode via Tailwind dark: variants.
 * Respects prefers-reduced-motion for hover animations.
 */

import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

const glassCardVariants = cva(
  [
    "rounded-xl transition-colors duration-200",
    "ring-1 ring-white/10 dark:ring-white/5",
  ].join(" "),
  {
    variants: {
      intensity: {
        subtle: "backdrop-blur-sm bg-white/50 dark:bg-white/[0.04] shadow-sm",
        medium: "backdrop-blur-md bg-white/60 dark:bg-white/[0.07] shadow-md",
        strong: "backdrop-blur-lg bg-white/70 dark:bg-white/[0.10] shadow-lg",
      },
      glow: {
        none: "",
        subtle:
          "border border-white/20 dark:border-white/10 shadow-[0_0_15px_-3px] shadow-primary/10",
        strong:
          "border border-primary/20 dark:border-primary/15 shadow-[0_0_25px_-5px] shadow-primary/25",
      },
    },
    defaultVariants: {
      intensity: "medium",
      glow: "subtle",
    },
  },
);

export interface GlassCardProps
  extends Omit<React.ComponentProps<typeof motion.div>, "ref">,
    VariantProps<typeof glassCardVariants> {}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ className, intensity, glow, children, ...props }, ref) => {
    const reduced = useReducedMotion();

    return (
      <motion.div
        ref={ref}
        data-slot="glass-card"
        className={cn(glassCardVariants({ intensity, glow }), className)}
        whileHover={reduced ? undefined : { scale: 1.008, y: -1 }}
        transition={reduced ? undefined : { type: "spring", stiffness: 400, damping: 25 }}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);

GlassCard.displayName = "GlassCard";
