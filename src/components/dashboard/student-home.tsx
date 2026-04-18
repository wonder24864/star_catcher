"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Sparkles, Star, Flag, Trophy } from "lucide-react";
import { StudentHeader } from "@/components/dashboard/student-header";
import { TodayReviews } from "@/components/dashboard/today-reviews";
import { JoinFamilyCard, FamilyInfoCard } from "@/components/dashboard/join-family-card";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useTier } from "@/components/providers/grade-tier-provider";
import type { LucideIcon } from "lucide-react";

type StatKey = "mastered" | "inProgress" | "newError" | "total";

const STAT_META: Record<
  StatKey,
  { icon: LucideIcon; tone: string; wonderTone: string; cosmicTone: string }
> = {
  mastered: {
    icon: Trophy,
    tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    wonderTone: "from-amber-300 to-yellow-500 text-white",
    cosmicTone:
      "from-emerald-500/30 to-cyan-500/30 text-emerald-100 border-emerald-400/40",
  },
  inProgress: {
    icon: Sparkles,
    tone: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
    wonderTone: "from-sky-300 to-indigo-400 text-white",
    cosmicTone:
      "from-indigo-500/30 to-violet-500/30 text-indigo-100 border-indigo-400/40",
  },
  newError: {
    icon: Flag,
    tone: "text-rose-600 bg-rose-50 dark:bg-rose-950/40",
    wonderTone: "from-rose-300 to-pink-500 text-white",
    cosmicTone:
      "from-rose-500/30 to-fuchsia-500/30 text-rose-100 border-rose-400/40",
  },
  total: {
    icon: Star,
    tone: "text-violet-600 bg-violet-50 dark:bg-violet-950/40",
    wonderTone: "from-fuchsia-300 to-violet-500 text-white",
    cosmicTone:
      "from-violet-500/30 to-blue-500/30 text-violet-100 border-violet-400/40",
  },
};

function StatCard({
  k,
  count,
  label,
}: {
  k: StatKey;
  count: number;
  label: string;
}) {
  const { tier } = useTier();
  const meta = STAT_META[k];
  const Icon = meta.icon;

  if (tier === "wonder") {
    return (
      <motion.div
        whileHover={{ scale: 1.05, rotate: -1 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "relative overflow-hidden rounded-2xl p-3 sm:p-4 bg-gradient-to-br shadow-md",
          meta.wonderTone
        )}
      >
        <Icon className="absolute -bottom-2 -right-2 h-16 w-16 opacity-20" />
        <div className="relative">
          <Icon className="h-5 w-5" />
          <div className="mt-2 text-2xl font-extrabold leading-none">
            {count}
          </div>
          <div className="mt-1 text-xs font-medium opacity-90">{label}</div>
        </div>
      </motion.div>
    );
  }

  if (tier === "cosmic") {
    return (
      <motion.div
        whileHover={{ scale: 1.03 }}
        className={cn(
          "relative overflow-hidden rounded-xl p-3 sm:p-4 border backdrop-blur-md",
          "bg-gradient-to-br",
          meta.cosmicTone
        )}
      >
        <div className="flex items-center justify-between">
          <Icon className="h-4 w-4" />
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{count}</div>
        <div className="mt-0.5 text-xs opacity-80">{label}</div>
      </motion.div>
    );
  }

  // flow / studio
  return (
    <div className={cn("rounded-lg border p-3 sm:p-4")}>
      <div className={cn("inline-flex rounded-md p-1.5", meta.tone)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{count}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function StudentHome() {
  const t = useTranslations();
  const { tier } = useTier();

  const { data: stats } = trpc.mastery.stats.useQuery(
    {},
    { staleTime: 30_000 }
  );

  const { data: families } = trpc.family.list.useQuery();
  const hasFamily = (families?.length ?? 0) > 0;

  const byStatus: Record<string, number> = {};
  for (const s of stats?.byStatus ?? []) byStatus[s.status] = s.count;
  const mastered = byStatus["MASTERED"] ?? 0;
  const inProgress = (byStatus["REVIEWING"] ?? 0) + (byStatus["CORRECTED"] ?? 0);
  const newError = (byStatus["NEW_ERROR"] ?? 0) + (byStatus["REGRESSED"] ?? 0);
  const total = stats?.total ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto pt-12 md:pt-0">
      <StudentHeader />

      {families === undefined ? null : hasFamily ? (
        <FamilyInfoCard family={families[0]} />
      ) : (
        <JoinFamilyCard />
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <StatCard k="mastered" count={mastered} label={t("student.stats.mastered")} />
        <StatCard k="inProgress" count={inProgress} label={t("student.stats.inProgress")} />
        <StatCard k="newError" count={newError} label={t("student.stats.newError")} />
        <StatCard k="total" count={total} label={t("student.stats.total")} />
      </div>

      {/* Playful CTA line only for wonder/cosmic */}
      {(tier === "wonder" || tier === "cosmic") && total === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className={cn(
            "rounded-2xl p-4 text-center",
            tier === "wonder"
              ? "bg-yellow-50 text-yellow-900 border-2 border-dashed border-yellow-300"
              : "bg-indigo-950/40 text-indigo-100 border border-indigo-500/30"
          )}
        >
          <div className="text-lg font-semibold">{t("student.emptyStats.title")}</div>
          <div className="mt-1 text-sm opacity-80">{t("student.emptyStats.subtitle")}</div>
        </motion.div>
      )}

      <TodayReviews />
    </div>
  );
}
