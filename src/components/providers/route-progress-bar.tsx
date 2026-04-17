"use client";

import { AppProgressBar } from "next-nprogress-bar";

/**
 * Global route-change progress bar. Shows a 3px strip at the top of the viewport
 * whenever Next.js App Router navigates (Link clicks and programmatic router.push
 * alike), eliminating the "I clicked but nothing happened" feeling that parents
 * reported for slow mutations + navigations.
 */
export function RouteProgressBar() {
  return (
    <AppProgressBar
      height="3px"
      color="hsl(var(--primary))"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
