"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { StudentSelector } from "./student-selector";

type NavItem = {
  label: string;
  href: string;
  roles: string[];
};

export function Sidebar() {
  const t = useTranslations();
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = session?.user?.role;

  const navItems: NavItem[] = [
    { label: t("nav.home"), href: "/", roles: ["STUDENT", "PARENT", "ADMIN"] },
    { label: t("nav.parentOverview"), href: "/parent/overview", roles: ["PARENT"] },
    { label: t("nav.parentStats"), href: "/parent/stats", roles: ["PARENT"] },
    { label: t("nav.parentReports"), href: "/parent/reports", roles: ["PARENT"] },
    { label: t("nav.check"), href: "/check", roles: ["STUDENT", "PARENT"] },
    { label: t("nav.errors"), href: "/errors", roles: ["STUDENT", "PARENT"] },
    { label: t("nav.mastery"), href: "/mastery", roles: ["STUDENT", "PARENT"] },
    { label: t("nav.family"), href: "/family", roles: ["STUDENT", "PARENT"] },
    { label: t("nav.settings"), href: "/settings", roles: ["STUDENT", "PARENT", "ADMIN"] },
    { label: t("nav.adminUsers"), href: "/admin/users", roles: ["ADMIN"] },
    { label: t("nav.agentTraces"), href: "/admin/agent-traces", roles: ["ADMIN"] },
    { label: t("nav.adminSettings"), href: "/admin/settings", roles: ["ADMIN"] },
  ];

  const filtered = navItems.filter((item) => role && item.roles.includes(role));

  // Strip locale prefix for path comparison
  const pathWithoutLocale = pathname.replace(/^\/(zh|en)/, "") || "/";

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r bg-sidebar-background">
      <div className="flex items-center gap-2 px-4 py-5">
        <span className="text-lg font-bold text-sidebar-primary">
          {t("app.name")}
        </span>
      </div>

      <Separator />

      {role === "PARENT" && (
        <>
          <div className="px-3 py-3">
            <StudentSelector />
          </div>
          <Separator />
        </>
      )}

      <nav className="flex-1 space-y-1 px-3 py-3">
        {filtered.map((item) => {
          const active = pathWithoutLocale === item.href ||
            (item.href !== "/" && pathWithoutLocale.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Separator />

      <div className="p-3">
        <div className="mb-2 px-3 text-sm text-muted-foreground truncate">
          {session?.user?.name}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          {t("auth.logout")}
        </Button>
      </div>
    </aside>
  );
}
