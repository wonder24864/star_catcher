"use client";

/**
 * Bottom tab bar — tier-adaptive visibility + styling.
 *
 * Visibility (D44):
 * - wonder / cosmic (P1-6): always visible (no sidebar → sole navigation)
 * - flow / studio: mobile only (md:hidden — sidebar replaces on desktop)
 *
 * Styling:
 * - wonder (P1-3): 3 tabs, large icons (56px), no labels
 * - cosmic (P4-6): 4 tabs, medium icons (44px), labels, active glow
 * - flow / studio: all role-appropriate tabs, standard sizing
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

type TabItem = {
  label: string;
  href: string;
  roles: string[];
  icon: string;
};

/**
 * Tier-based navigation whitelist.
 * `null` = show all role-appropriate tabs.
 */
const TIER_NAV_HREFS: Record<GradeTier, string[] | null> = {
  wonder: ["/check", "/errors", "/tasks"],
  cosmic: ["/check", "/errors", "/mastery", "/tasks"],
  flow: null,
  studio: null,
};

export function BottomNav() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const { tier, nav } = useTier();

  const tabs: TabItem[] = [
    { label: t("nav.check"), href: "/check", roles: ["STUDENT", "PARENT"], icon: "📝" },
    { label: t("nav.errors"), href: "/errors", roles: ["STUDENT", "PARENT"], icon: "📚" },
    { label: t("nav.mastery"), href: "/mastery", roles: ["STUDENT", "PARENT"], icon: "🗺️" },
    { label: t("nav.tasks"), href: "/tasks", roles: ["STUDENT", "PARENT"], icon: "📋" },
    { label: t("nav.learningProfile"), href: "/student/profile", roles: ["STUDENT", "PARENT"], icon: "📊" },
    { label: t("nav.parentOverview"), href: "/parent/overview", roles: ["PARENT"], icon: "🏠" },
    { label: t("nav.family"), href: "/family", roles: ["STUDENT", "PARENT"], icon: "👨‍👩‍👧" },
    { label: t("nav.adminUsers"), href: "/admin/users", roles: ["ADMIN"], icon: "👥" },
    { label: t("nav.settings"), href: "/settings", roles: ["STUDENT", "PARENT", "ADMIN"], icon: "⚙️" },
  ];

  // Step 1: filter by role
  let filtered = tabs.filter((tab) => role && tab.roles.includes(role));

  // Step 2: filter by tier whitelist
  const tierHrefs = TIER_NAV_HREFS[tier];
  if (tierHrefs) {
    filtered = filtered.filter((tab) => tierHrefs.includes(tab.href));
  }

  const pathWithoutLocale = pathname.replace(/^\/(zh|en)/, "") || "/";

  // Tier-specific icon sizing
  const iconClass = tier === "wonder"
    ? "text-4xl leading-none"          // 56px equivalent
    : tier === "cosmic"
      ? "text-3xl leading-none"        // 44px equivalent
      : "text-lg leading-none";        // default

  // wonder/cosmic: no sidebar → bottom nav visible on ALL screen sizes
  // flow/studio: sidebar on md+ → bottom nav hidden on md+
  const hasSidebar = tier === "flow" || tier === "studio";

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex border-t bg-background",
        hasSidebar && "md:hidden",
        tier === "cosmic" && "border-primary/20 bg-background/80 backdrop-blur-md"
      )}
      aria-label="Bottom navigation"
    >
      {filtered.map((tab) => {
        const active =
          pathWithoutLocale === tab.href ||
          (tab.href !== "/" && pathWithoutLocale.startsWith(tab.href));

        return (
          <Link
            key={tab.href}
            href={`/${locale}${tab.href}`}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 font-medium transition-colors",
              // Tier-specific padding
              tier === "wonder" ? "py-3" : tier === "cosmic" ? "py-2.5" : "py-2",
              // Tier-specific text size
              tier === "wonder" ? "text-sm" : "text-xs",
              // Active / inactive states
              active
                ? cn(
                    "text-primary",
                    // Cosmic glow effect on active tab
                    tier === "cosmic" && "drop-shadow-[0_0_8px_var(--primary)]"
                  )
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className={iconClass}>{tab.icon}</span>
            {nav.showLabel && (
              <span className="max-w-[4rem] truncate">{tab.label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
