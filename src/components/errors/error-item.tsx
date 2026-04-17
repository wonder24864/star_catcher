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
 */

import Link from "next/link";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
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

  // Shared body. For wonder we add extra left padding so text doesn't collide
  // with the 8px subject-color rail; other tiers use stock horizontal padding.
  const body = (
    <CardContent
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
                tier === "wonder"
                  ? "bg-amber-100 text-amber-800 border-amber-400"
                  : tier === "cosmic"
                    ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/50"
                    : "text-green-600 border-green-600"
              )}
            >
              {tier === "wonder" && <Star className="h-3 w-3 fill-amber-500" />}
              {t("mastery.status.MASTERED")}
            </Badge>
          )}
        </div>
        <p
          className={cn(
            "line-clamp-2 text-foreground",
            tier === "wonder" ? "text-base" : "text-sm"
          )}
        >
          <MathText text={eq.content} />
        </p>
        {eq.aiKnowledgePoint && (
          <p className="text-xs text-muted-foreground mt-1">
            {t("homework.knowledgePoint")}: {eq.aiKnowledgePoint}
          </p>
        )}
      </div>
      <div className="text-right text-xs text-muted-foreground shrink-0">
        <p>{new Date(eq.createdAt).toLocaleDateString(dateLocale)}</p>
        <p className="mt-1">
          {t("homework.attemptCount", { count: eq.totalAttempts })}
        </p>
      </div>
    </CardContent>
  );

  // Wonder: chunky gradient rail + bouncy
  if (tier === "wonder") {
    return (
      <motion.div whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}>
        <Link href={`/errors/${eq.id}`}>
          <AdaptiveCard
            className="cursor-pointer relative overflow-hidden"
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
          </AdaptiveCard>
        </Link>
      </motion.div>
    );
  }

  // Cosmic: neon border pulse
  if (tier === "cosmic") {
    return (
      <motion.div whileHover={{ scale: 1.01 }}>
        <Link href={`/errors/${eq.id}`}>
          <AdaptiveCard
            className="cursor-pointer relative"
            style={{
              boxShadow: `inset 0 0 0 1px ${subjectHex}55, 0 0 16px -4px ${subjectHex}40`,
            }}
          >
            {body}
          </AdaptiveCard>
        </Link>
      </motion.div>
    );
  }

  // flow / studio: stock
  return (
    <Link href={`/errors/${eq.id}`}>
      <AdaptiveCard className="cursor-pointer">{body}</AdaptiveCard>
    </Link>
  );
}
