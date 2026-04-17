"use client";

/**
 * Hero student-info card for StudentHome.
 *
 * Renders a tier-adaptive greeting card with:
 * - Large avatar (gradient, tier-themed)
 * - Nickname + greeting
 * - Grade badge
 * - Family name + parent nicknames
 *
 * Tiers:
 * - wonder (P1-3): playful pastels, bouncy gradient, sparkle overlay
 * - cosmic (P4-6): space gradient, glow, neon accents
 * - flow  (junior): clean glass card
 * - studio (senior): minimal
 */

import { motion } from "framer-motion";
import { Sparkles, Users, Heart } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { useTier } from "@/components/providers/grade-tier-provider";

function initialsOf(nickname: string | null | undefined): string {
  if (!nickname) return "?";
  return Array.from(nickname.trim())[0] ?? "?";
}

function getGreeting(t: ReturnType<typeof useTranslations>): string {
  const hour = new Date().getHours();
  if (hour < 6) return t("student.greeting.lateNight");
  if (hour < 11) return t("student.greeting.morning");
  if (hour < 14) return t("student.greeting.noon");
  if (hour < 18) return t("student.greeting.afternoon");
  return t("student.greeting.evening");
}

export function StudentHeader() {
  const t = useTranslations();
  const { data: session } = useSession();
  const { tier } = useTier();

  const nickname = session?.user?.name ?? "";
  const grade = session?.user?.grade ?? null;

  const { data: families } = trpc.family.list.useQuery(undefined, {
    enabled: !!session?.user,
  });

  const family = families?.[0];
  const parents = (family?.members ?? [])
    .filter((m) => m.user.role === "PARENT")
    .map((m) => m.user.nickname);

  const gradeLabel = grade ? t(`grades.${grade}` as never) : null;
  const greeting = getGreeting(t);

  // Tier-specific visual treatment
  const cardClasses = cn(
    "relative overflow-hidden rounded-3xl p-5 sm:p-6",
    tier === "wonder" &&
      "bg-gradient-to-br from-rose-300 via-fuchsia-300 to-violet-400 text-white shadow-[0_20px_60px_-15px_oklch(0.6_0.25_330_/_0.6)]",
    tier === "cosmic" &&
      "bg-gradient-to-br from-indigo-950 via-violet-900 to-slate-900 text-white border border-indigo-500/30 shadow-[0_0_40px_-8px_oklch(0.5_0.25_280_/_0.7)]",
    tier === "flow" &&
      "bg-gradient-to-br from-sky-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 border shadow-sm",
    tier === "studio" && "bg-card border"
  );

  // Root wraps Fallback with overflow-hidden; bg/text classes on Root are
  // masked by Fallback. Split: sizing + ring on Root, fill color + text on
  // Fallback.
  const avatarRootClasses = cn(
    "h-16 w-16 sm:h-20 sm:w-20",
    tier === "wonder" && "ring-4 ring-white/50",
    tier === "cosmic" &&
      "ring-2 ring-cyan-300/40 shadow-[0_0_24px_oklch(0.8_0.2_210_/_0.6)]",
  );
  const avatarFallbackClasses = cn(
    "text-2xl sm:text-3xl font-extrabold",
    tier === "wonder" && "bg-white/90 text-fuchsia-600",
    tier === "cosmic" &&
      "bg-gradient-to-br from-cyan-400 to-violet-500 text-white",
    tier === "flow" && "bg-gradient-to-br from-sky-400 to-indigo-500 text-white",
    tier === "studio" && "bg-muted text-foreground",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cardClasses}
    >
      {/* Decorative glow for wonder/cosmic */}
      {tier === "wonder" && (
        <>
          <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-yellow-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-6 h-32 w-32 rounded-full bg-pink-200/40 blur-3xl" />
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-3 right-6"
            animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-6 w-6 text-yellow-200" />
          </motion.div>
        </>
      )}
      {tier === "cosmic" && (
        <>
          <div className="pointer-events-none absolute inset-0 opacity-50">
            <div className="absolute top-6 left-12 h-1 w-1 rounded-full bg-cyan-200 shadow-[0_0_8px_oklch(0.9_0.15_210)]" />
            <div className="absolute top-16 right-20 h-1.5 w-1.5 rounded-full bg-violet-200 shadow-[0_0_10px_oklch(0.8_0.2_290)]" />
            <div className="absolute bottom-8 right-10 h-1 w-1 rounded-full bg-fuchsia-200 shadow-[0_0_8px_oklch(0.85_0.2_330)]" />
            <div className="absolute bottom-14 left-24 h-0.5 w-0.5 rounded-full bg-white" />
          </div>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-3 right-4"
            animate={{ y: [-2, 2, -2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </motion.div>
        </>
      )}

      <div className="relative flex items-center gap-4 sm:gap-5">
        <Avatar className={avatarRootClasses} size="lg">
          <AvatarFallback className={avatarFallbackClasses}>
            {initialsOf(nickname)}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-sm sm:text-base opacity-90",
              tier !== "wonder" && tier !== "cosmic" && "text-muted-foreground"
            )}
          >
            {greeting}
          </p>
          <h1
            className={cn(
              "mt-0.5 truncate font-bold",
              tier === "wonder" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
            )}
          >
            {nickname || t("app.name")}
          </h1>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {gradeLabel && (
              <Badge
                variant="secondary"
                className={cn(
                  "font-semibold",
                  tier === "wonder" && "bg-white/90 text-fuchsia-700 border-0",
                  tier === "cosmic" &&
                    "bg-cyan-500/20 text-cyan-100 border border-cyan-400/40"
                )}
              >
                {gradeLabel}
              </Badge>
            )}
            {family && (
              <Badge
                variant="outline"
                className={cn(
                  "font-normal gap-1",
                  tier === "wonder" && "bg-white/20 text-white border-white/40",
                  tier === "cosmic" &&
                    "bg-violet-500/15 text-violet-100 border-violet-400/40"
                )}
              >
                <Users className="h-3 w-3" />
                {family.name}
              </Badge>
            )}
            {parents.length > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  "font-normal gap-1 max-w-[12rem]",
                  tier === "wonder" && "bg-white/20 text-white border-white/40",
                  tier === "cosmic" &&
                    "bg-pink-500/15 text-pink-100 border-pink-400/40"
                )}
                title={parents.join(" · ")}
              >
                <Heart className="h-3 w-3" />
                <span className="truncate">{parents.join(" · ")}</span>
              </Badge>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
