/**
 * Unit Tests: TierSidebar — visibility per tier (D39/D44)
 *
 * TierSidebar is a client wrapper that hides the sidebar for
 * wonder/cosmic tiers (P1-6 students use bottom nav only) and
 * shows it for flow/studio tiers on md+ screens.
 */
import { describe, test, expect } from "vitest";
import { gradeToTier } from "@/components/providers/grade-tier-provider";

// We test the tier-gating logic via gradeToTier since TierSidebar
// renders null when tierIndex <= 2 and Sidebar when tierIndex >= 3.

describe("TierSidebar visibility logic", () => {
  const sidebarTiers = new Set(["flow", "studio"]);
  const noSidebarTiers = new Set(["wonder", "cosmic"]);

  test("wonder/cosmic → no sidebar (P1-6 students)", () => {
    for (const grade of ["PRIMARY_1", "PRIMARY_2", "PRIMARY_3", "PRIMARY_4", "PRIMARY_5", "PRIMARY_6"]) {
      const tier = gradeToTier(grade, "STUDENT");
      expect(noSidebarTiers.has(tier)).toBe(true);
    }
  });

  test("flow/studio → sidebar visible (junior/senior students)", () => {
    for (const grade of ["JUNIOR_1", "JUNIOR_2", "JUNIOR_3", "SENIOR_1", "SENIOR_2", "SENIOR_3"]) {
      const tier = gradeToTier(grade, "STUDENT");
      expect(sidebarTiers.has(tier)).toBe(true);
    }
  });

  test("PARENT always gets sidebar (studio tier)", () => {
    const tier = gradeToTier(null, "PARENT");
    expect(tier).toBe("studio");
    expect(sidebarTiers.has(tier)).toBe(true);
  });

  test("ADMIN always gets sidebar (studio tier)", () => {
    const tier = gradeToTier(null, "ADMIN");
    expect(tier).toBe("studio");
    expect(sidebarTiers.has(tier)).toBe(true);
  });
});
