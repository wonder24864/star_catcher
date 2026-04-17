"use client";

/**
 * Floating avatar top-bar with identity + logout, rendered for EVERY role.
 *
 * Rationale: wonder/cosmic students have no sidebar at all; flow/studio users
 * only see the sidebar on md+. On mobile every role needs a quick way to see
 * who they're signed in as and to sign out. Desktop-with-sidebar has some
 * harmless redundancy.
 *
 * Dropdown contents branch by role:
 * - STUDENT: nickname + grade + family + parent nicknames
 * - PARENT:  nickname + "家长" badge + family + linked students count
 * - ADMIN:   nickname + "管理员" badge
 *
 * Visual style branches by tier for students (wonder/cosmic are playful),
 * and falls back to a neutral studio look for parents/admins regardless of
 * their underlying tier mapping.
 */

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { Home, LogOut, Shield, Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

function initialsOf(nickname: string | null | undefined): string {
  if (!nickname) return "?";
  // Take the first character (works for both CJK and Latin)
  return Array.from(nickname.trim())[0] ?? "?";
}

// Tier-based avatar gradient. Non-students use a neutral studio look.
function avatarGradientFor(role: string, tier: GradeTier): string {
  if (role !== "STUDENT") {
    return role === "ADMIN"
      ? "bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-md"
      : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md";
  }
  if (tier === "wonder")
    return "bg-gradient-to-br from-pink-400 via-fuchsia-400 to-violet-500 text-white shadow-[0_4px_20px_-2px_oklch(0.7_0.22_330_/_0.6)]";
  if (tier === "cosmic")
    return "bg-gradient-to-br from-indigo-500 via-purple-500 to-cyan-400 text-white shadow-[0_0_20px_oklch(0.7_0.2_280_/_0.6)]";
  if (tier === "flow")
    return "bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-md";
  return "bg-muted text-foreground";
}

// Trigger button container style, also tier-based for students only.
function triggerBgFor(role: string, tier: GradeTier): string {
  if (role !== "STUDENT") return "bg-background border";
  if (tier === "wonder") return "bg-white/80 backdrop-blur-sm shadow-lg";
  if (tier === "cosmic")
    return "bg-background/70 backdrop-blur-md shadow-[0_0_16px_oklch(0.6_0.22_290_/_0.3)]";
  if (tier === "flow") return "bg-background/80 backdrop-blur-sm shadow-sm";
  return "bg-background border";
}

export function UserTopBar() {
  const t = useTranslations();
  const locale = useLocale();
  const { data: session } = useSession();
  const { tier } = useTier();

  const role = session?.user?.role;
  const nickname = session?.user?.name ?? "";
  const grade = session?.user?.grade ?? null;

  // Students + parents need family info; admins don't.
  // Query runs once per session and is cached by tRPC across pages.
  const { data: families } = trpc.family.list.useQuery(undefined, {
    enabled: !!role && role !== "ADMIN",
  });

  if (!role) return null;

  const family = families?.[0];
  const parents = (family?.members ?? [])
    .filter((m) => m.user.role === "PARENT")
    .map((m) => m.user.nickname);
  const studentsInFamily = (family?.members ?? []).filter(
    (m) => m.user.role === "STUDENT",
  );

  const gradeLabel = grade ? t(`grades.${grade}` as never) : null;
  const avatarGradient = avatarGradientFor(role, tier);
  const triggerBg = triggerBgFor(role, tier);

  return (
    <div className={cn("fixed right-3 top-3 z-50", "md:right-6 md:top-6")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("user.account")}
            className={cn(
              "group flex items-center gap-2 rounded-full p-1 transition-all",
              "hover:scale-105 active:scale-95",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              triggerBg,
            )}
          >
            {/* AvatarFallback covers the Root, so the gradient belongs on
                the Fallback. Ring classes stay on Root (visible outside the
                clipped area). */}
            <Avatar size="lg" className="ring-2 ring-white/60">
              <AvatarFallback className={cn("font-bold text-base", avatarGradient)}>
                {initialsOf(nickname)}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          {/* Identity block */}
          <DropdownMenuLabel className="flex items-center gap-3 py-2">
            <Avatar size="lg">
              <AvatarFallback className={cn("font-bold", avatarGradient)}>
                {initialsOf(nickname)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="font-semibold truncate">{nickname || "—"}</span>
              <div className="flex items-center gap-1 flex-wrap">
                {role === "STUDENT" && gradeLabel && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {gradeLabel}
                  </Badge>
                )}
                {role === "PARENT" && (
                  <Badge
                    variant="secondary"
                    className="text-xs font-normal gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
                  >
                    <Users className="h-3 w-3" />
                    {t("auth.parent")}
                  </Badge>
                )}
                {role === "ADMIN" && (
                  <Badge
                    variant="secondary"
                    className="text-xs font-normal gap-1 bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
                  >
                    <Shield className="h-3 w-3" />
                    {t("user.adminLabel")}
                  </Badge>
                )}
              </div>
            </div>
          </DropdownMenuLabel>

          {/* Family block (STUDENT / PARENT only) */}
          {role !== "ADMIN" && family && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex flex-col gap-0.5 py-2 font-normal">
                <span className="text-xs text-muted-foreground">
                  {t("student.myFamily")}
                </span>
                <span className="text-sm truncate">{family.name}</span>

                {role === "STUDENT" && parents.length > 0 && (
                  <>
                    <span className="text-xs text-muted-foreground mt-1">
                      {t("student.myParent")}
                    </span>
                    <span className="text-sm truncate">{parents.join(" · ")}</span>
                  </>
                )}

                {role === "PARENT" && (
                  <>
                    <span className="text-xs text-muted-foreground mt-1">
                      {t("user.myStudents")}
                    </span>
                    <span className="text-sm truncate">
                      {studentsInFamily.length > 0
                        ? studentsInFamily.map((m) => m.user.nickname).join(" · ")
                        : t("user.noStudents")}
                    </span>
                  </>
                )}
              </DropdownMenuLabel>
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href={`/${locale}/`} className="cursor-pointer">
              <Home className="mr-2 h-4 w-4" />
              {t("nav.home")}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            className="cursor-pointer text-destructive focus:text-destructive"
            onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            {t("auth.logout")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
