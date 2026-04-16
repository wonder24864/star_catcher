"use client";

/**
 * Tier-gated sidebar wrapper.
 *
 * - wonder / cosmic (P1-6): sidebar hidden — students use bottom nav only
 * - flow / studio (junior+): sidebar shown on desktop (md+)
 *
 * This is a client component because layout.tsx is a Server Component
 * and cannot call useTier(). Same pattern as StarField's internal tier gate.
 */

import { useTier } from "@/components/providers/grade-tier-provider";
import { Sidebar } from "./sidebar";

export function TierSidebar() {
  const { tierIndex } = useTier();

  // wonder (1) and cosmic (2): no sidebar, bottom nav only
  if (tierIndex <= 2) return null;

  return (
    <div className="hidden md:flex">
      <Sidebar />
    </div>
  );
}
