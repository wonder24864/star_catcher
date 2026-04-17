"use client";

/**
 * Tier-adaptive subject badge.
 *
 * Wraps shadcn Badge with tier × subject color palettes:
 * - wonder: warm saturated pastels, rounded-full, larger padding
 * - cosmic: neon glow edge, drop-shadow
 * - flow: muted gradient, fine border
 * - studio: monochrome with colored left dot indicator
 */

import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

export interface AdaptiveSubjectBadgeProps {
  /** Subject key (e.g. "MATH", "CHINESE", "ENGLISH", "PHYSICS", etc.) */
  subject: string;
  children: ReactNode;
  className?: string;
  tierOverride?: GradeTier;
}

// ---------------------------------------------------------------------------
// Color palettes per tier × subject
// ---------------------------------------------------------------------------

interface SubjectColors {
  bg: string;
  text: string;
  glow?: string; // cosmic only
  dot?: string;  // studio only
}

const DEFAULT_COLORS: SubjectColors = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  dot: "bg-gray-400",
};

// Text stepped to -800 (from -700) + bg to -200 (from -100): on a nested
// translucent card the lighter pair bled into the card bg and the pill looked
// empty. -800/-200 keeps the pastel feel while passing WCAG AA.
const WONDER_PALETTE: Record<string, SubjectColors> = {
  MATH:    { bg: "bg-rose-200", text: "text-rose-800" },
  CHINESE: { bg: "bg-teal-200", text: "text-teal-800" },
  ENGLISH: { bg: "bg-violet-200", text: "text-violet-800" },
  PHYSICS: { bg: "bg-amber-200", text: "text-amber-800" },
  CHEMISTRY: { bg: "bg-cyan-200", text: "text-cyan-800" },
  BIOLOGY: { bg: "bg-lime-200", text: "text-lime-800" },
  HISTORY: { bg: "bg-orange-200", text: "text-orange-800" },
  GEOGRAPHY: { bg: "bg-sky-200", text: "text-sky-800" },
};

const COSMIC_PALETTE: Record<string, SubjectColors> = {
  MATH:    { bg: "bg-blue-500/15", text: "text-blue-300", glow: "drop-shadow-[0_0_4px_oklch(0.6_0.2_250)]" },
  CHINESE: { bg: "bg-cyan-500/15", text: "text-cyan-300", glow: "drop-shadow-[0_0_4px_oklch(0.7_0.15_200)]" },
  ENGLISH: { bg: "bg-amber-500/15", text: "text-amber-300", glow: "drop-shadow-[0_0_4px_oklch(0.75_0.15_80)]" },
  PHYSICS: { bg: "bg-purple-500/15", text: "text-purple-300", glow: "drop-shadow-[0_0_4px_oklch(0.6_0.22_290)]" },
  CHEMISTRY: { bg: "bg-emerald-500/15", text: "text-emerald-300", glow: "drop-shadow-[0_0_4px_oklch(0.7_0.15_165)]" },
  BIOLOGY: { bg: "bg-green-500/15", text: "text-green-300", glow: "drop-shadow-[0_0_4px_oklch(0.7_0.15_145)]" },
  HISTORY: { bg: "bg-orange-500/15", text: "text-orange-300", glow: "drop-shadow-[0_0_4px_oklch(0.7_0.15_55)]" },
  GEOGRAPHY: { bg: "bg-sky-500/15", text: "text-sky-300", glow: "drop-shadow-[0_0_4px_oklch(0.65_0.18_230)]" },
};

// Text stepped to -700 (from -600) + bg to -100 (from -50): same rationale as
// WONDER_PALETTE — subtle tones were fine on a plain white card but bled into
// nested translucent cards.
const FLOW_PALETTE: Record<string, SubjectColors> = {
  MATH:    { bg: "bg-purple-100 border border-purple-300", text: "text-purple-700" },
  CHINESE: { bg: "bg-green-100 border border-green-300", text: "text-green-700" },
  ENGLISH: { bg: "bg-blue-100 border border-blue-300", text: "text-blue-700" },
  PHYSICS: { bg: "bg-indigo-100 border border-indigo-300", text: "text-indigo-700" },
  CHEMISTRY: { bg: "bg-teal-100 border border-teal-300", text: "text-teal-700" },
  BIOLOGY: { bg: "bg-emerald-100 border border-emerald-300", text: "text-emerald-700" },
  HISTORY: { bg: "bg-amber-100 border border-amber-300", text: "text-amber-700" },
  GEOGRAPHY: { bg: "bg-cyan-100 border border-cyan-300", text: "text-cyan-700" },
};

const STUDIO_PALETTE: Record<string, SubjectColors> = {
  MATH:    { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-purple-500" },
  CHINESE: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-green-500" },
  ENGLISH: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-blue-500" },
  PHYSICS: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-indigo-500" },
  CHEMISTRY: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-teal-500" },
  BIOLOGY: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-emerald-500" },
  HISTORY: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-amber-500" },
  GEOGRAPHY: { bg: "bg-secondary", text: "text-secondary-foreground", dot: "bg-cyan-500" },
};

const PALETTES: Record<GradeTier, Record<string, SubjectColors>> = {
  wonder: WONDER_PALETTE,
  cosmic: COSMIC_PALETTE,
  flow: FLOW_PALETTE,
  studio: STUDIO_PALETTE,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdaptiveSubjectBadge({
  subject,
  children,
  className,
  tierOverride,
}: AdaptiveSubjectBadgeProps) {
  const { tier: contextTier } = useTier();
  const tier = tierOverride ?? contextTier;
  const palette = PALETTES[tier];
  const colors = palette[subject] ?? DEFAULT_COLORS;

  if (tier === "wonder") {
    return (
      <Badge
        variant="ghost"
        className={cn(
          "rounded-full px-3 py-1 border-transparent",
          colors.bg,
          colors.text,
          className,
        )}
      >
        {children}
      </Badge>
    );
  }

  if (tier === "cosmic") {
    return (
      <Badge
        variant="ghost"
        className={cn(
          "rounded-md border-transparent",
          colors.bg,
          colors.text,
          colors.glow,
          className,
        )}
      >
        {children}
      </Badge>
    );
  }

  if (tier === "flow") {
    return (
      <Badge
        variant="ghost"
        className={cn(
          "rounded-md border-transparent",
          colors.bg,
          colors.text,
          className,
        )}
      >
        {children}
      </Badge>
    );
  }

  // Studio: monochrome with colored left dot
  return (
    <Badge
      variant="ghost"
      className={cn(
        "gap-1.5 rounded-md border-transparent",
        colors.bg,
        colors.text,
        className,
      )}
    >
      <span
        className={cn("block h-2 w-2 shrink-0 rounded-full", colors.dot ?? "bg-gray-400")}
        aria-hidden
      />
      {children}
    </Badge>
  );
}
