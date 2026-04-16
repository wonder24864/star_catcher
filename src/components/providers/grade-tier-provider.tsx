"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GradeTier = "wonder" | "cosmic" | "flow" | "studio";

export interface TierConfig {
  /** Tier slug used for CSS data-theme and asset paths */
  tier: GradeTier;
  /** 1-based index for numeric comparisons (lower = younger) */
  tierIndex: 1 | 2 | 3 | 4;
  /** framer-motion transition parameters (read in JS, not CSS) */
  transition: {
    type: "scale-fade" | "slide-blur" | "spring-slide" | "fast-fade";
    duration: number;
  };
  /** Bottom nav configuration */
  nav: {
    maxTabs: 3 | 4 | 5;
    iconSize: number;
    showLabel: boolean;
  };
  /** Celebration animation style */
  celebration: "confetti" | "energy-burst" | "ripple" | "toast";
}

// ---------------------------------------------------------------------------
// Tier configurations
// ---------------------------------------------------------------------------

const TIER_CONFIGS: Record<GradeTier, TierConfig> = {
  wonder: {
    tier: "wonder",
    tierIndex: 1,
    transition: { type: "scale-fade", duration: 0.3 },
    nav: { maxTabs: 3, iconSize: 56, showLabel: false },
    celebration: "confetti",
  },
  cosmic: {
    tier: "cosmic",
    tierIndex: 2,
    transition: { type: "slide-blur", duration: 0.25 },
    nav: { maxTabs: 4, iconSize: 44, showLabel: true },
    celebration: "energy-burst",
  },
  flow: {
    tier: "flow",
    tierIndex: 3,
    transition: { type: "spring-slide", duration: 0.2 },
    nav: { maxTabs: 5, iconSize: 24, showLabel: true },
    celebration: "ripple",
  },
  studio: {
    tier: "studio",
    tierIndex: 4,
    transition: { type: "fast-fade", duration: 0.15 },
    nav: { maxTabs: 5, iconSize: 24, showLabel: true },
    celebration: "toast",
  },
};

// ---------------------------------------------------------------------------
// Grade → Tier mapping
// ---------------------------------------------------------------------------

/**
 * Maps a student's grade + role to a UI tier.
 *
 * - PRIMARY_1~3  → wonder  (Magic Wonderland)
 * - PRIMARY_4~6  → cosmic  (Cosmic Explorer)
 * - JUNIOR_*     → flow    (Minimal Flow)
 * - SENIOR_*     → studio  (Studio Pro)
 * - Non-student  → studio
 */
export function gradeToTier(
  grade: string | null | undefined,
  role: string | null | undefined
): GradeTier {
  if (role !== "STUDENT") return "studio";
  if (!grade) return "studio";

  if (grade.startsWith("PRIMARY_")) {
    const num = parseInt(grade.split("_")[1], 10);
    return num <= 3 ? "wonder" : "cosmic";
  }
  if (grade.startsWith("JUNIOR_")) return "flow";
  return "studio"; // SENIOR_* or unknown
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const TierContext = createContext<TierConfig>(TIER_CONFIGS.studio);

/**
 * Hook to read the current grade tier configuration.
 *
 * @example
 * const { tier, transition, nav } = useTier();
 */
export function useTier(): TierConfig {
  return useContext(TierContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/**
 * Provides grade-based tier configuration to the component tree.
 *
 * Replaces the old ThemeProvider — this single provider handles both:
 * 1. React Context for structural tier info (nav tabs, animation style, etc.)
 * 2. DOM `data-theme` attribute on <html> for CSS variable switching
 */
export function GradeTierProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const tier = gradeToTier(session?.user?.grade, session?.user?.role);
  const config = TIER_CONFIGS[tier];

  // Sync CSS theme via data-theme attribute
  useEffect(() => {
    const root = document.documentElement;
    if (tier === "studio") {
      // Studio uses :root defaults — no attribute needed
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", tier);
    }
  }, [tier]);

  const value = useMemo(() => config, [config]);

  return <TierContext.Provider value={value}>{children}</TierContext.Provider>;
}
