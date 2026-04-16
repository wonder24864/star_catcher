"use client";

/**
 * Tier-adaptive card wrapper.
 *
 * Wraps the shadcn Card component with tier-specific visual styles:
 * - wonder: extra-round, large shadow, hover bounce
 * - cosmic: glass effect, glow border, backdrop-blur
 * - flow: subtle glass, hover lift
 * - studio: standard shadcn Card (no extras)
 */

import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

const TIER_CARD_CLASSES: Record<GradeTier, string> = {
  wonder: "rounded-[14px] shadow-lg hover:scale-[1.02] transition-transform duration-200",
  cosmic: "bg-card/90 backdrop-blur-md border-primary/20 shadow-[0_0_12px_oklch(0.6_0.22_290_/_0.15)] hover:shadow-[0_0_20px_oklch(0.6_0.22_290_/_0.25)] transition-shadow duration-200",
  flow: "backdrop-blur-sm bg-card/80 hover:-translate-y-0.5 transition-transform duration-150",
  studio: "", // standard
};

export const AdaptiveCard = forwardRef<
  HTMLDivElement,
  ComponentProps<typeof Card> & { tierOverride?: GradeTier }
>(({ className, tierOverride, ...props }, ref) => {
  const { tier: contextTier } = useTier();
  const tier = tierOverride ?? contextTier;

  return (
    <Card
      ref={ref}
      className={cn(TIER_CARD_CLASSES[tier], className)}
      {...props}
    />
  );
});

AdaptiveCard.displayName = "AdaptiveCard";
