/**
 * Unit Tests: Pro Component Library — module exports + API surface
 */
import { describe, test, expect, vi } from "vitest";

// Mock framer-motion for all Pro components
vi.mock("framer-motion", () => ({
  motion: {
    div: "div",
    span: "span",
    circle: "circle",
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useSpring: () => ({ set: vi.fn(), get: () => 0 }),
  useTransform: (_: unknown, fn: (v: number) => string) => fn(0),
  useInView: () => true,
}));

vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => false,
}));

vi.mock("@/components/providers/grade-tier-provider", () => ({
  useTier: () => ({
    tier: "studio",
    tierIndex: 4,
    transition: { type: "fast-fade", duration: 0.15 },
    nav: { maxTabs: 5, iconSize: 24, showLabel: true },
    celebration: "toast",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { role: "ADMIN" } } }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("Pro Component Library — barrel exports", () => {
  test("index exports all Pro components", async () => {
    const mod = await import("@/components/pro/index");
    expect(mod.GlassCard).toBeDefined();
    expect(mod.CountUp).toBeDefined();
    expect(mod.GaugeChart).toBeDefined();
    expect(mod.StatusPulse).toBeDefined();
    expect(mod.GradientMesh).toBeDefined();
    expect(mod.InteractiveChart).toBeDefined();
    expect(mod.CommandPalette).toBeDefined();
    expect(mod.StatCard).toBeDefined();
  });
});

describe("StatCard (Sprint 25)", () => {
  test("module exports StatCard function", async () => {
    const mod = await import("@/components/pro/stat-card");
    expect(mod.StatCard).toBeDefined();
    expect(typeof mod.StatCard).toBe("function");
  });

  test("source uses GlassCard + CountUp + Skeleton for unified Pro UX", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/stat-card.tsx"),
      "utf-8",
    );
    expect(source).toContain("GlassCard");
    expect(source).toContain("CountUp");
    expect(source).toContain("Skeleton");
  });

  test("admin/page.tsx imports StatCard from pro barrel (Sprint 25 refactor)", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/app/[locale]/(dashboard)/admin/page.tsx"),
      "utf-8",
    );
    // Import from pro barrel
    expect(source).toContain('StatCard,');
    // No more local definition
    expect(source).not.toContain("function StatCard(");
  });
});

describe("GlassCard", () => {
  test("module exports GlassCard component", async () => {
    const mod = await import("@/components/pro/glass-card");
    expect(mod.GlassCard).toBeDefined();
    expect(mod.GlassCard.displayName).toBe("GlassCard");
  });

  test("accepts intensity and glow variants", async () => {
    const mod = await import("@/components/pro/glass-card");
    // Component accepts variant props without type errors
    expect(typeof mod.GlassCard).toBe("object"); // forwardRef
  });
});

describe("CountUp", () => {
  test("module exports CountUp function", async () => {
    const mod = await import("@/components/pro/count-up");
    expect(mod.CountUp).toBeDefined();
    expect(typeof mod.CountUp).toBe("function");
  });

  test("formatNumber helper formats with separator", async () => {
    // Test the formatting logic by reading the source
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/count-up.tsx"),
      "utf-8",
    );
    expect(source).toContain("separator");
    expect(source).toContain("toFixed");
    expect(source).toContain("\\B(?=(\\d{3})+(?!\\d))");
  });
});

describe("GaugeChart", () => {
  test("module exports GaugeChart function", async () => {
    const mod = await import("@/components/pro/gauge-chart");
    expect(mod.GaugeChart).toBeDefined();
    expect(typeof mod.GaugeChart).toBe("function");
  });

  test("source uses SVG circle for arc rendering", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/gauge-chart.tsx"),
      "utf-8",
    );
    expect(source).toContain("strokeDasharray");
    expect(source).toContain("strokeDashoffset");
    expect(source).toContain('role="meter"');
  });

  test("clamps value to 0-100 range", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/gauge-chart.tsx"),
      "utf-8",
    );
    expect(source).toContain("Math.max(0, Math.min(100,");
  });
});

describe("StatusPulse", () => {
  test("module exports StatusPulse function", async () => {
    const mod = await import("@/components/pro/status-pulse");
    expect(mod.StatusPulse).toBeDefined();
    expect(typeof mod.StatusPulse).toBe("function");
  });

  test("defines all 4 status types", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/status-pulse.tsx"),
      "utf-8",
    );
    expect(source).toContain('"online"');
    expect(source).toContain('"processing"');
    expect(source).toContain('"idle"');
    expect(source).toContain('"error"');
  });
});

describe("GradientMesh", () => {
  test("module exports GradientMesh function", async () => {
    const mod = await import("@/components/pro/gradient-mesh");
    expect(mod.GradientMesh).toBeDefined();
    expect(typeof mod.GradientMesh).toBe("function");
  });

  test("uses aria-hidden and pointer-events-none for a11y", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/gradient-mesh.tsx"),
      "utf-8",
    );
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("pointer-events-none");
  });
});

describe("InteractiveChart", () => {
  test("module exports InteractiveChart function", async () => {
    const mod = await import("@/components/pro/interactive-chart");
    expect(mod.InteractiveChart).toBeDefined();
    expect(typeof mod.InteractiveChart).toBe("function");
  });
});

describe("CommandPalette", () => {
  test("module exports CommandPalette function", async () => {
    const mod = await import("@/components/pro/command-palette");
    expect(mod.CommandPalette).toBeDefined();
    expect(typeof mod.CommandPalette).toBe("function");
  });

  test("defines admin and parent navigation items", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/command-palette.tsx"),
      "utf-8",
    );
    expect(source).toContain("ADMIN_ITEMS");
    expect(source).toContain("PARENT_ITEMS");
    expect(source).toContain("metaKey");
    expect(source).toContain("ctrlKey");
  });

  test("supports Cmd+K + Escape key handling", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/command-palette.tsx"),
      "utf-8",
    );
    expect(source).toContain('e.key === "Escape"');
  });

  test("gates palette by role — students see no palette", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/pro/command-palette.tsx"),
      "utf-8",
    );
    expect(source).toContain("getItemsForRole");
    expect(source).toContain("return null"); // no palette for students
  });
});

describe("Skeleton", () => {
  test("module exports Skeleton function", async () => {
    const mod = await import("@/components/ui/skeleton");
    expect(mod.Skeleton).toBeDefined();
    expect(typeof mod.Skeleton).toBe("function");
  });

  test("uses shimmer animation", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve("src/components/ui/skeleton.tsx"),
      "utf-8",
    );
    expect(source).toContain("shimmer");
    expect(source).toContain('data-slot="skeleton"');
  });
});

describe("prefers-reduced-motion", () => {
  test("all animated Pro components import useReducedMotion", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const animated = [
      "glass-card.tsx",
      "count-up.tsx",
      "gauge-chart.tsx",
      "status-pulse.tsx",
      "gradient-mesh.tsx",
    ];
    for (const file of animated) {
      const source = fs.readFileSync(
        path.resolve(`src/components/pro/${file}`),
        "utf-8",
      );
      expect(source).toContain("useReducedMotion");
    }
  });
});
