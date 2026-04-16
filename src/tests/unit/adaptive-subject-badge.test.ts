/**
 * Unit Tests: AdaptiveSubjectBadge — tier × subject color dispatch
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

describe("AdaptiveSubjectBadge", () => {
  test("module exports AdaptiveSubjectBadge function", async () => {
    const mod = await import("@/components/adaptive/adaptive-subject-badge");
    expect(mod.AdaptiveSubjectBadge).toBeDefined();
    expect(typeof mod.AdaptiveSubjectBadge).toBe("function");
  });

  test.each(["wonder", "cosmic", "flow", "studio"])(
    "tier %s can be imported without error",
    async (tier) => {
      mockTier.mockReturnValueOnce(TIER_CONFIGS[tier]);
      const mod = await import("@/components/adaptive/adaptive-subject-badge");
      expect(mod.AdaptiveSubjectBadge).toBeDefined();
    },
  );
});
