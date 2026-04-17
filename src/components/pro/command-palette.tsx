"use client";

/**
 * CommandPalette — Cmd+K global search for Pro dashboards.
 *
 * Built on cmdk (Radix ecosystem). Groups navigation items by role.
 * Mounted in the dashboard layout; available on all dashboard pages.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Command } from "cmdk";
import {
  Users,
  LayoutDashboard,
  Puzzle,
  Network,
  Brain,
  FlaskConical,
  Settings,
  BarChart3,
  FileText,
  Lightbulb,
  Home,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  href: string;
}

const ADMIN_ITEMS: CommandItem[] = [
  { id: "admin-dashboard", label: "commandPalette.items.dashboard", icon: <LayoutDashboard className="h-4 w-4" />, href: "/admin" },
  { id: "admin-users", label: "commandPalette.items.users", icon: <Users className="h-4 w-4" />, href: "/admin/users" },
  { id: "admin-skills", label: "commandPalette.items.skills", icon: <Puzzle className="h-4 w-4" />, href: "/admin/skills" },
  { id: "admin-kg", label: "commandPalette.items.knowledgeGraph", icon: <Network className="h-4 w-4" />, href: "/admin/knowledge-graph" },
  { id: "admin-brain", label: "commandPalette.items.brain", icon: <Brain className="h-4 w-4" />, href: "/admin/brain" },
  { id: "admin-eval", label: "commandPalette.items.eval", icon: <FlaskConical className="h-4 w-4" />, href: "/admin/eval" },
  { id: "admin-settings", label: "commandPalette.items.settings", icon: <Settings className="h-4 w-4" />, href: "/admin/settings" },
];

const PARENT_ITEMS: CommandItem[] = [
  { id: "parent-overview", label: "commandPalette.items.overview", icon: <Home className="h-4 w-4" />, href: "/parent/overview" },
  { id: "parent-stats", label: "commandPalette.items.stats", icon: <BarChart3 className="h-4 w-4" />, href: "/parent/stats" },
  { id: "parent-reports", label: "commandPalette.items.reports", icon: <FileText className="h-4 w-4" />, href: "/parent/reports" },
  { id: "parent-suggestions", label: "commandPalette.items.suggestions", icon: <Lightbulb className="h-4 w-4" />, href: "/parent/suggestions" },
];

function getItemsForRole(role: string | undefined): CommandItem[] | null {
  if (role === "ADMIN") return ADMIN_ITEMS;
  if (role === "PARENT") return PARENT_ITEMS;
  return null; // students: palette disabled
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations();
  const items = getItemsForRole(session?.user?.role);

  // Cmd+K / Ctrl+K toggle + ESC to close
  useEffect(() => {
    if (!items) return; // no palette for this role
    const handler = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [items]);

  const onSelect = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!items || !open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Palette */}
      <div className="absolute left-1/2 top-[20%] w-full max-w-lg -translate-x-1/2">
        <Command
          className={cn(
            "rounded-xl border shadow-2xl",
            "bg-white/80 dark:bg-black/80",
            "backdrop-blur-xl",
            "ring-1 ring-white/20 dark:ring-white/10",
            "overflow-hidden",
          )}
          label={t("commandPalette.placeholder")}
        >
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Command.Input
              className={cn(
                "flex h-11 w-full bg-transparent py-3 text-sm outline-none",
                "placeholder:text-muted-foreground",
              )}
              placeholder={t("commandPalette.placeholder")}
              autoFocus
            />
            <kbd className="hidden text-xs text-muted-foreground sm:inline-flex">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-72 overflow-y-auto p-2">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              {t("commandPalette.noResults")}
            </Command.Empty>

            <Command.Group
              heading={t("commandPalette.groups.navigation")}
              className="text-xs font-medium text-muted-foreground mb-1 px-2"
            >
              {items.map((item) => (
                <Command.Item
                  key={item.id}
                  value={t(item.label)}
                  onSelect={() => onSelect(item.href)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm cursor-pointer",
                    "aria-selected:bg-primary/10 aria-selected:text-primary",
                    "hover:bg-muted/50",
                  )}
                >
                  <span className="text-muted-foreground">{item.icon}</span>
                  <span>{t(item.label)}</span>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
