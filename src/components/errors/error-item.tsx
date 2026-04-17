"use client";

/**
 * Tier-adaptive error-question list card.
 *
 * Variants:
 * - wonder: chunky gradient rail on the left (subject-colored), bouncy hover,
 *   mastered items flash a gold star badge.
 * - cosmic: neon glow border, subtle scale-up on hover, mastered items show a
 *   glowing ring.
 * - flow / studio: stock clean card, hover raise.
 *
 * We deliberately use an opaque `bg-card` wrapper (not <AdaptiveCard>) because
 * in flow/cosmic the adaptive card applies `bg-card/80` / `bg-card/90` and
 * when these items render inside SessionGroup's own muted wrapper the
 * translucency compounds and the content text becomes unreadable. User report
 * 2026-04-17 "卡片和字都是浅色看不清".
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { MathText } from "@/components/ui/math-text";
import { SUBJECT_HEX_COLORS } from "@/lib/constants/subject-colors";
import { useTier } from "@/components/providers/grade-tier-provider";
import { cn } from "@/lib/utils";

interface ErrorItemProps {
  eq: {
    id: string;
    content: string;
    subject: string;
    isMastered: boolean;
    aiKnowledgePoint: string | null;
    createdAt: string | Date;
    totalAttempts: number;
  };
}

export function ErrorItem({ eq }: ErrorItemProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { tier } = useTier();
  const subjectHex = SUBJECT_HEX_COLORS[eq.subject] ?? "#6b7280";
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";

  // Shared body content. For wonder we add extra left padding so text doesn't
  // collide with the 8px subject-color rail; other tiers use stock padding.
  const body = (
    <div
      className={cn(
        "py-3 px-4 flex items-start gap-3",
        tier === "wonder" && "pl-5",
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <AdaptiveSubjectBadge subject={eq.subject}>
            {t(`homework.subjects.${eq.subject}`)}
          </AdaptiveSubjectBadge>
          {eq.isMastered && (
            <Badge
              variant="outline"
              className={cn(
                "gap-1",
                // Note: we sit on a white `bg-card` (the outer wrapper uses
                // `bg-card`), so cosmic's "emerald-200 on translucent bg"
                // won't work — use an opaque emerald-100/-800 pair that's
                // readable against white in every tier.
                tier === "wonder"
                  ? "bg-amber-100 text-amber-800 border-amber-400"
                  : tier === "cosmic"
                    ? "bg-emerald-100 text-emerald-800 border-emerald-500"
                    : "text-green-700 border-green-600",
              )}
            >
              {tier === "wonder" && <Star className="h-3 w-3 fill-amber-500" />}
              {t("mastery.status.MASTERED")}
            </Badge>
          )}
        </div>
        <p
          className={cn(
            // Explicit `text-card-foreground` (not text-foreground) — the card
            // wrapper sets the color scope via `bg-card text-card-foreground`
            // and children should inherit it; being explicit protects against
            // CSS-var inheritance surprises.
            "line-clamp-2 font-medium text-card-foreground",
            tier === "wonder" ? "text-base" : "text-sm"
          )}
        >
          <MathText text={eq.content} />
        </p>
        {eq.aiKnowledgePoint && (
          <p className="text-xs mt-1">
            {/* Muted-looking label, but derived from card-foreground so it
                still contrasts against bg-card even in cosmic tier where
                --muted-foreground flips light for the dark page bg. */}
            <span className="text-card-foreground/60">
              {t("homework.knowledgePoint")}:
            </span>{" "}
            <span className="text-card-foreground">{eq.aiKnowledgePoint}</span>
          </p>
        )}
      </div>
      <div className="text-right text-xs text-card-foreground/60 shrink-0">
        <p>{new Date(eq.createdAt).toLocaleDateString(dateLocale)}</p>
        <p className="mt-1">
          {t("homework.attemptCount", { count: eq.totalAttempts })}
        </p>
      </div>
    </div>
  );

  // Tier-specific outer shell (all fully opaque `bg-card` for readability).
  const wrapperBase = "block cursor-pointer rounded-xl border bg-card text-card-foreground shadow-sm transition-all overflow-hidden";

  if (tier === "wonder") {
    return (
      <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
        <Link
          href={`/errors/${eq.id}`}
          className={cn(wrapperBase, "relative")}
          style={{
            boxShadow: `0 10px 30px -10px ${subjectHex}66`,
          }}
        >
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-2"
            style={{ backgroundColor: subjectHex }}
          />
          {body}
        </Link>
      </motion.div>
    );
  }

  if (tier === "cosmic") {
    return (
      <motion.div whileHover={{ scale: 1.01 }}>
        <Link
          href={`/errors/${eq.id}`}
          className={cn(wrapperBase, "relative")}
          style={{
            boxShadow: `inset 0 0 0 1px ${subjectHex}55, 0 0 16px -4px ${subjectHex}40`,
          }}
        >
          {body}
        </Link>
      </motion.div>
    );
  }

  // flow / studio: stock opaque card with subtle hover
  return (
    <Link
      href={`/errors/${eq.id}`}
      className={cn(wrapperBase, "hover:-translate-y-0.5 hover:shadow-md")}
    >
      {body}
    </Link>
  );
}
