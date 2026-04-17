"use client";

/**
 * Collapsible group of error questions that came from the same homework
 * session. Used by the errors list "grouped by session" view.
 *
 * Header shows the session title, date, and final score; body lists each
 * error via <ErrorItem>. A "manual" group (sessionless errors) renders with
 * a fallback header.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ClipboardList } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { ErrorItem } from "./error-item";
import { cn } from "@/lib/utils";
import { useTier } from "@/components/providers/grade-tier-provider";

interface SessionInfo {
  id: string;
  title: string | null;
  subject: string | null;
  finalScore: number | null;
  createdAt: string | Date;
}

interface ErrorQuestion {
  id: string;
  content: string;
  subject: string;
  isMastered: boolean;
  aiKnowledgePoint: string | null;
  createdAt: string | Date;
  totalAttempts: number;
}

interface SessionGroupProps {
  session: SessionInfo | null;
  items: ErrorQuestion[];
  /** Auto-expand on mount; typically true for the first group. */
  defaultOpen?: boolean;
}

export function SessionGroup({ session, items, defaultOpen = false }: SessionGroupProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { tier } = useTier();
  const [open, setOpen] = useState(defaultOpen);
  const dateLocale = locale === "zh" ? "zh-CN" : "en-US";

  const title = session?.title ?? t("errors.group.manual");
  const dateStr = session
    ? new Date(session.createdAt).toLocaleDateString(dateLocale)
    : null;

  // We use a plain border+bg-card wrapper instead of <AdaptiveCard> to avoid
  // double-translucency when a tier's card style uses `bg-card/80` (flow) or
  // `bg-card/90` (cosmic): nesting two translucent cards blended with the
  // WonderField background made error text wash out (user feedback: "字基本看不清了").
  return (
    <div className="rounded-xl border bg-card text-card-foreground shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full text-left transition-colors",
          "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        )}
        aria-expanded={open}
      >
        <div className="px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                tier === "wonder"
                  ? "bg-gradient-to-br from-fuchsia-200 to-violet-200 text-fuchsia-800"
                  : tier === "cosmic"
                    ? "bg-cyan-500/20 border border-cyan-400/50 text-cyan-100"
                    : "bg-muted text-foreground",
              )}
            >
              <ClipboardList className="h-4 w-4" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground truncate">
                  {title}
                </span>
                {session?.subject && (
                  <AdaptiveSubjectBadge subject={session.subject}>
                    {t(`homework.subjects.${session.subject}`)}
                  </AdaptiveSubjectBadge>
                )}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {dateStr && <span>{dateStr}</span>}
                {session?.finalScore != null && (
                  <>
                    <span>·</span>
                    <span>
                      {t("homework.score", { score: session.finalScore })}
                    </span>
                  </>
                )}
                <span>·</span>
                <Badge
                  variant="outline"
                  className="text-xs font-medium text-foreground border-foreground/20"
                >
                  {t("errors.group.errorCount", { count: items.length })}
                </Badge>
              </div>
            </div>

            <motion.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 text-muted-foreground"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.div>
          </div>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <div className="px-3 pb-3 space-y-2 border-t bg-muted/30">
              <div className="pt-3 space-y-2">
                {items.map((eq, index) => (
                  <motion.div
                    key={eq.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index, 10) * 0.03, duration: 0.18 }}
                  >
                    <ErrorItem eq={eq} />
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
