"use client";

/**
 * Tier-adaptive button wrapper.
 *
 * Wraps the shadcn Button with tier-specific framer-motion interactions:
 * - wonder: spring bounce (whileTap/whileHover scale)
 * - cosmic: hover glow (animated boxShadow)
 * - flow: subtle lift (hover translateY -2px)
 * - studio: pass-through to plain Button (zero runtime overhead)
 */

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";
import { type VariantProps } from "class-variance-authority";

export interface AdaptiveButtonProps
  extends Omit<React.ComponentProps<"button">, "style">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  tierOverride?: GradeTier;
}

// ---------------------------------------------------------------------------
// Motion configs per tier
// ---------------------------------------------------------------------------

const WONDER_MOTION: Partial<HTMLMotionProps<"button">> = {
  whileTap: { scale: 0.92 },
  whileHover: { scale: 1.05 },
  transition: { type: "spring", stiffness: 300, damping: 15 },
};

const COSMIC_MOTION: Partial<HTMLMotionProps<"button">> = {
  whileHover: {
    boxShadow: "0 0 16px oklch(0.6 0.22 290 / 0.5)",
  },
  transition: { duration: 0.2, ease: "easeInOut" },
};

const FLOW_MOTION: Partial<HTMLMotionProps<"button">> = {
  whileHover: { y: -2 },
  transition: { type: "spring", stiffness: 400, damping: 20 },
};

const TIER_MOTION: Record<GradeTier, Partial<HTMLMotionProps<"button">> | null> = {
  wonder: WONDER_MOTION,
  cosmic: COSMIC_MOTION,
  flow: FLOW_MOTION,
  studio: null, // pass-through
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AdaptiveButton = forwardRef<HTMLButtonElement, AdaptiveButtonProps>(
  ({ className, variant, size, asChild, tierOverride, children, ...props }, ref) => {
    const { tier: contextTier } = useTier();
    const tier = tierOverride ?? contextTier;
    const motionConfig = TIER_MOTION[tier];

    // Studio: no motion wrapper, zero overhead
    if (!motionConfig) {
      return (
        <Button
          ref={ref}
          className={className}
          variant={variant}
          size={size}
          asChild={asChild}
          {...props}
        >
          {children}
        </Button>
      );
    }

    // Motion-wrapped tiers
    return (
      <motion.button
        ref={ref}
        data-slot="button"
        data-variant={variant ?? "default"}
        data-size={size ?? "default"}
        className={cn(
          buttonVariants({ variant, size }),
          className,
        )}
        {...motionConfig}
        {...(props as HTMLMotionProps<"button">)}
      >
        {children}
      </motion.button>
    );
  },
);

AdaptiveButton.displayName = "AdaptiveButton";
