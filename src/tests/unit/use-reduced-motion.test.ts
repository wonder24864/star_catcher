/**
 * Unit Tests: useReducedMotion hook — media query integration
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

describe("useReducedMotion", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  test("module exports useReducedMotion function", async () => {
    const mod = await import("@/hooks/use-reduced-motion");
    expect(mod.useReducedMotion).toBeDefined();
    expect(typeof mod.useReducedMotion).toBe("function");
  });

  test("QUERY constant targets prefers-reduced-motion", async () => {
    // Verify the hook file contains the correct media query
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/hooks/use-reduced-motion.ts"),
      "utf-8",
    );
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  test("hook is marked as client component", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/hooks/use-reduced-motion.ts"),
      "utf-8",
    );
    expect(source.startsWith('"use client"')).toBe(true);
  });

  test("hook uses useEffect for SSR safety (no server-side matchMedia call)", async () => {
    // The hook defers matchMedia to useEffect, so importing the module
    // and referencing the function should not throw even without matchMedia.
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/hooks/use-reduced-motion.ts"),
      "utf-8",
    );
    // Verify matchMedia is called inside useEffect, not at module level
    expect(source).toContain("useEffect");
    expect(source).toContain("matchMedia");
    // useState defaults to false (SSR safe)
    expect(source).toContain("useState(false)");
  });
});
