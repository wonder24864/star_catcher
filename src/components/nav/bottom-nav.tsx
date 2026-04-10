"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type TabItem = {
  label: string;
  href: string;
  roles: string[];
  icon: string; // simple emoji or text icon
};

/** Bottom tab bar — shown on mobile (< md), hidden on desktop. */
export function BottomNav() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;

  const tabs: TabItem[] = [
    {
      label: t("nav.check"),
      href: "/check",
      roles: ["STUDENT", "PARENT"],
      icon: "📝",
    },
    {
      label: t("nav.errors"),
      href: "/errors",
      roles: ["STUDENT", "PARENT"],
      icon: "📚",
    },
    {
      label: t("nav.parentOverview"),
      href: "/parent/overview",
      roles: ["PARENT"],
      icon: "🏠",
    },
    {
      label: t("nav.family"),
      href: "/family",
      roles: ["STUDENT", "PARENT"],
      icon: "👨‍👩‍👧",
    },
    {
      label: t("nav.adminUsers"),
      href: "/admin/users",
      roles: ["ADMIN"],
      icon: "👥",
    },
    {
      label: t("nav.settings"),
      href: "/settings",
      roles: ["STUDENT", "PARENT", "ADMIN"],
      icon: "⚙️",
    },
  ];

  const filtered = tabs.filter((tab) => role && tab.roles.includes(role));
  const pathWithoutLocale = pathname.replace(/^\/(zh|en)/, "") || "/";

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-background md:hidden"
      aria-label="Bottom navigation"
    >
      {filtered.map((tab) => {
        const active =
          pathWithoutLocale === tab.href ||
          (tab.href !== "/" && pathWithoutLocale.startsWith(tab.href));

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors",
              active
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span className="text-lg leading-none">{tab.icon}</span>
            <span className="max-w-[4rem] truncate">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
