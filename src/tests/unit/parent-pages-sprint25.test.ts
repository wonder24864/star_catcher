/**
 * Unit Tests — Sprint 25 parent page modernization (overview / stats / reports).
 *
 * Source-level assertions (matching Sprint 24 `pro-components.test.ts` style) to
 * verify each page migrated to Pro components, URL-param drill-down wiring,
 * intervention-effect paired gauges, and i18n key coverage.
 */
import { describe, test, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function read(rel: string): string {
  return fs.readFileSync(path.resolve(rel), "utf-8");
}

describe("Sprint 25 — parent/overview migrated to Pro components", () => {
  const source = read(
    "src/app/[locale]/(dashboard)/parent/overview/page.tsx",
  );

  test("imports GlassCard + GradientMesh + StatusPulse from Pro barrel", () => {
    expect(source).toContain("GlassCard");
    expect(source).toContain("GradientMesh");
    expect(source).toContain("StatusPulse");
    expect(source).toContain('from "@/components/pro"');
  });

  test("uses Skeleton placeholders during loading (no plain text)", () => {
    expect(source).toContain("Skeleton");
    expect(source).not.toContain("<p>loading...</p>");
  });

  test("wires ?date= URL param → state (drill-down support)", () => {
    expect(source).toContain("useSearchParams");
    expect(source).toContain('searchParams?.get("date")');
    expect(source).toContain("router.replace");
    expect(source).toContain("scroll: false");
  });

  test("Session status shows StatusPulse (idle vs processing)", () => {
    expect(source).toMatch(/StatusPulse[\s\S]*"COMPLETED"/);
    expect(source).toContain('"processing"');
    expect(source).toContain('"idle"');
  });

  test("no legacy shadcn Card import (pages migrated to GlassCard)", () => {
    expect(source).not.toContain(
      'from "@/components/ui/card"',
    );
  });
});

describe("Sprint 25 — parent/stats migrated + errorTrend drill-down", () => {
  const source = read("src/app/[locale]/(dashboard)/parent/stats/page.tsx");

  test("imports GradientMesh + InteractiveChart + StatCard from Pro barrel", () => {
    expect(source).toContain("GradientMesh");
    expect(source).toContain("InteractiveChart");
    expect(source).toContain("StatCard");
    expect(source).toContain('from "@/components/pro"');
  });

  test("errorTrend Bar onClick navigates to overview?date=<day>", () => {
    expect(source).toContain("handleErrorDayClick");
    expect(source).toContain("router.push");
    expect(source).toContain("/parent/overview?date=");
    expect(source).toContain("onClick={(data) =>");
  });

  test("uses useLocale() to build locale-aware navigation URL", () => {
    expect(source).toContain("useLocale");
    expect(source).toContain("/${locale}/parent/overview");
  });

  test("passes loading + empty + emptyText to InteractiveChart for every chart", () => {
    // At least 5 InteractiveChart instances (errorTrend, subjectDist, avgScore, checkCount, helpFreq)
    const matches = source.match(/<InteractiveChart/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(5);
    expect(source).toContain("emptyText={t(\"common.noData\")}");
  });

  test("summary cards use StatCard (not raw shadcn Card)", () => {
    expect(source).toContain("<StatCard");
    // legacy Card import removed
    expect(source).not.toContain('from "@/components/ui/card"');
  });

  test("drill-down tooltip hint uses new i18n key parent.stats.clickToView", () => {
    expect(source).toContain('"parent.stats.clickToView"');
  });
});

describe("Sprint 25 — parent/reports migrated + intervention effect section", () => {
  const source = read(
    "src/app/[locale]/(dashboard)/parent/reports/page.tsx",
  );

  test("imports GaugeChart + StatCard + InteractiveChart + GlassCard from Pro barrel", () => {
    expect(source).toContain("GaugeChart");
    expect(source).toContain("StatCard");
    expect(source).toContain("InteractiveChart");
    expect(source).toContain("GlassCard");
    expect(source).toContain('from "@/components/pro"');
  });

  test("summary row uses 4 StatCards (CountUp numbers + reviewCompletionRate Gauge)", () => {
    const matches = source.match(/<StatCard/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("reviewCompletionRate rendered via embedded GaugeChart (child of StatCard)", () => {
    expect(source).toContain("reviewRate");
    expect(source).toContain("reviewsCompleted /");
    expect(source).toContain("GaugeChart value={reviewRate}");
  });

  test("intervention effect section calls parent.interventionEffect query + paired GaugeCharts", () => {
    expect(source).toContain("trpc.parent.interventionEffect.useQuery");
    expect(source).toContain("eff.preMastery");
    expect(source).toContain("eff.postMastery");
    expect(source).toContain("masteryToPercent");
    // paired gauges with delta
    expect(source).toContain("eff.delta");
    expect(source).toContain("<ArrowRight");
  });

  test("reuses existing i18n keys (not adding duplicates)", () => {
    expect(source).toContain('"parent.intervention.effectTitle"');
    expect(source).toContain('"parent.intervention.emptyEffect"');
    expect(source).toContain('"parent.intervention.preMastery"');
    expect(source).toContain('"parent.intervention.postMastery"');
  });

  test("masteryToPercent maps 5 status ordinals to 0-100 correctly", () => {
    expect(source).toContain("NEW_ERROR: 0");
    expect(source).toContain("MASTERED: 100");
    expect(source).toContain("CORRECTED: 50");
  });
});

describe("Sprint 25 — i18n new keys present in zh + en", () => {
  const zh = JSON.parse(read("src/i18n/messages/zh.json")) as Record<
    string,
    unknown
  >;
  const en = JSON.parse(read("src/i18n/messages/en.json")) as Record<
    string,
    unknown
  >;

  function getPath(obj: Record<string, unknown>, p: string): unknown {
    return p.split(".").reduce<unknown>((acc, k) => {
      if (acc && typeof acc === "object" && !Array.isArray(acc)) {
        return (acc as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj);
  }

  test("parent.stats.clickToView exists in both locales", () => {
    expect(getPath(zh, "parent.stats.clickToView")).toBeTypeOf("string");
    expect(getPath(en, "parent.stats.clickToView")).toBeTypeOf("string");
  });

  test("parent.reports.interventionEffectHint exists in both locales", () => {
    expect(getPath(zh, "parent.reports.interventionEffectHint")).toBeTypeOf(
      "string",
    );
    expect(getPath(en, "parent.reports.interventionEffectHint")).toBeTypeOf(
      "string",
    );
  });
});

describe("Sprint 25 — admin/page.tsx refactored to use shared StatCard", () => {
  const source = read("src/app/[locale]/(dashboard)/admin/page.tsx");

  test("imports StatCard from Pro barrel, no local definition", () => {
    expect(source).toContain("StatCard,");
    expect(source).toContain('from "@/components/pro"');
    expect(source).not.toContain("function StatCard(");
  });
});
