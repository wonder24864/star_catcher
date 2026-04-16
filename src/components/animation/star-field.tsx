"use client";

/**
 * Star field guard — only renders the Three.js canvas for the cosmic tier.
 *
 * Uses React.lazy to code-split the Three.js bundle. Non-cosmic tiers
 * return null immediately without loading any Three.js code.
 */

import { lazy, Suspense } from "react";
import { useTier } from "@/components/providers/grade-tier-provider";

const LazyCanvas = lazy(() => import("./star-field-canvas"));

export function StarField() {
  const { tier } = useTier();

  // Non-cosmic tiers: no Three.js loaded at all
  if (tier !== "cosmic") return null;

  return (
    <Suspense fallback={null}>
      <div
        className="fixed inset-0 -z-10 pointer-events-none"
        aria-hidden="true"
      >
        <LazyCanvas />
      </div>
    </Suspense>
  );
}
