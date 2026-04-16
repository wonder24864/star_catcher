/**
 * Unit Tests: AdaptiveScore — tier-specific renderer dispatch
 */
import { describe, test, expect, vi } from "vitest";
import type { TierConfig } from "@/components/providers/grade-tier-provider";

const TIER_CONFIGS: Record<string, TierConfig> = {
  wonder: {
    tier: "wonder", tierIndex: 1,
    transition: { type: "scale-fade", duration: 0.3 },
    nav: { maxTabs: 3, iconSize: 56, showLabel: false },
    celebration: "confetti",
  },
  cosmic: {
    tier: "cosmic", tierIndex: 2,
    transition: { type: "slide-blur", duration: 0.25 },
    nav: { maxTabs: 4, iconSize: 44, showLabel: true },
    celebration: "energy-burst",
  },
  flow: {
    tier: "flow", tierIndex: 3,
    transition: { type: "spring-slide", duration: 0.2 },
    nav: { maxTabs: 5, iconSize: 24, showLabel: true },
    celebration: "ripple",
  },
  studio: {
    tier: "studio", tierIndex: 4,
    transition: { type: "fast-fade", duration: 0.15 },
    nav: { maxTabs: 5, iconSize: 24, showLabel: true },
    celebration: "toast",
  },
};

const mockTier = vi.fn((): TierConfig => TIER_CONFIGS.studio);

vi.mock("@/components/providers/grade-tier-provider", () => ({
  useTier: () => mockTier(),
  gradeToTier: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: { span: "span", div: "div" },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useSpring: () => ({ set: vi.fn(), get: () => 0 }),
  useTransform: (_: unknown, fn: (v: number) => number) => fn(0),
}));

describe("AdaptiveScore", () => {
  test("module exports AdaptiveScore function", async () => {
    const mod = await import("@/components/adaptive/adaptive-score");
    expect(mod.AdaptiveScore).toBeDefined();
    expect(typeof mod.AdaptiveScore).toBe("function");
  });

  test.each(["wonder", "cosmic", "flow", "studio"])(
    "tier %s can be imported without error",
    async (tier) => {
      mockTier.mockReturnValueOnce(TIER_CONFIGS[tier]);
      const mod = await import("@/components/adaptive/adaptive-score");
      expect(mod.AdaptiveScore).toBeDefined();
    },
  );
});
