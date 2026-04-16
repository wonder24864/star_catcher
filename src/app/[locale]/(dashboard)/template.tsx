"use client";

/**
 * Dashboard page transition layer.
 *
 * Uses Next.js `template.tsx` so the component re-mounts on every
 * navigation, triggering framer-motion's initial→animate enter animation.
 *
 * NOTE: Exit animations are NOT possible with template.tsx — when the
 * template unmounts, the entire tree (including AnimatePresence) is
 * destroyed before exit can fire. This is a known Next.js App Router
 * limitation. We only do enter animations, which is sufficient for
 * a smooth page transition feel.
 *
 * Each tier has its own enter style:
 * - wonder:  scale + fade (center bloom)
 * - cosmic:  slide + blur (right slide-in)
 * - flow:    spring horizontal slide
 * - studio:  fast fade (0.15s)
 */

import { motion, type TargetAndTransition } from "framer-motion";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

// ---------------------------------------------------------------------------
// Per-tier enter variants (initial → animate)
// ---------------------------------------------------------------------------

type EnterState = { initial: TargetAndTransition; animate: TargetAndTransition };

const ENTER_VARIANTS: Record<GradeTier, EnterState> = {
  wonder: {
    initial: { scale: 0.92, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
  },
  cosmic: {
    initial: { x: 40, opacity: 0, filter: "blur(6px)" },
    animate: { x: 0, opacity: 1, filter: "blur(0px)" },
  },
  flow: {
    initial: { x: 24, opacity: 0 },
    animate: { x: 0, opacity: 1 },
  },
  studio: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
};

// Spring-like ease curve for flow tier
const FLOW_EASE = [0.32, 0.72, 0, 1] as const;

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { tier, transition } = useTier();
  const variant = ENTER_VARIANTS[tier];

  return (
    <motion.div
      initial={variant.initial}
      animate={variant.animate}
      transition={{
        duration: transition.duration,
        ease: tier === "flow" ? FLOW_EASE : "easeOut",
      }}
    >
      {children}
    </motion.div>
  );
}
