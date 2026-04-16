"use client";

/**
 * Student Profile Page (US-070).
 *
 * 3-section layout:
 * 1. Mastery Dashboard — subject-grouped ring progress
 * 2. Historical Progress — cumulative line chart (shared component)
 * 3. Learning Journey — multi-source event timeline
 *
 * Fully 4-tier adaptive (wonder/cosmic/flow/studio).
 */

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { useTier } from "@/components/providers/grade-tier-provider";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { CardContent } from "@/components/ui/card";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveProgress } from "@/components/adaptive/adaptive-progress";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { HistoricalProgressChart } from "@/components/profile/historical-progress-chart";
import { cn } from "@/lib/utils";

// ─── Event type → emoji (wonder tier) ──────────

const EVENT_EMOJI: Record<string, string> = {
  MASTERED: "\u2B50",
  NEW_ERROR: "\u270F\uFE0F",
  CORRECTED: "\u2705",
  HOMEWORK_COMPLETED: "\uD83C\uDF92",
  INTERVENTION_DIAGNOSIS: "\uD83D\uDD0D",
  INTERVENTION_HINT: "\uD83D\uDCA1",
  INTERVENTION_REVIEW: "\uD83D\uDD04",
  INTERVENTION_EXPLANATION: "\uD83D\uDCDA",
  INTERVENTION_PRACTICE: "\uD83D\uDCDD",
  INTERVENTION_BRAIN_DECISION: "\uD83E\uDDE0",
};

// ─── Event type color for timeline dots ────────

const EVENT_DOT_COLOR: Record<string, string> = {
  MASTERED: "bg-green-500",
  NEW_ERROR: "bg-red-400",
  CORRECTED: "bg-orange-400",
  HOMEWORK_COMPLETED: "bg-blue-500",
};

// ─── Page ──────────────────────────────────────

export default function StudentProfilePage() {
  const tP = useTierTranslations("learningProfile");
  const tHw = useTranslations("homework");
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);
  const { tier, tierIndex } = useTier();

  const isParent = session?.user?.role === "PARENT";
  const studentId = isParent ? selectedStudentId : session?.user?.id;
  const queryStudentId = isParent ? (studentId ?? undefined) : undefined;

  // ─── Data fetching ───────────────────────────

  const { data: dashboardData, isLoading: dashLoading } =
    trpc.profile.masteryDashboard.useQuery(
      { studentId: queryStudentId },
      { enabled: !!studentId },
    );

  const { data: journeyData, isLoading: journeyLoading } =
    trpc.profile.learningJourney.useQuery(
      { studentId: queryStudentId },
      { enabled: !!studentId },
    );

  const subjects = dashboardData
    ? Object.entries(dashboardData.bySubject)
    : [];

  const events = journeyData?.events ?? [];

  // Tier-branched grid: wonder/cosmic=2col, flow/studio=3col
  const gridClass =
    tierIndex <= 2
      ? "grid grid-cols-2 gap-3"
      : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <h1 className="text-xl font-bold">{tP("title")}</h1>

      {/* ── Section 1: Mastery Dashboard ──────── */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {tP("dashboard.title")}
        </h2>

        {!dashLoading && subjects.length === 0 ? (
          <AdaptiveCard>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {tP("empty")}
            </CardContent>
          </AdaptiveCard>
        ) : (
          <div className={gridClass}>
            {subjects.map(([subject, counts], index) => {
              const pct =
                counts.total > 0
                  ? Math.round((counts.mastered / counts.total) * 100)
                  : 0;
              return (
                <motion.div
                  key={subject}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(index, 15) * 0.06,
                    duration: 0.3,
                  }}
                >
                  <AdaptiveCard>
                    <CardContent className="flex flex-col items-center gap-2 py-4">
                      <AdaptiveSubjectBadge subject={subject}>
                        {tHw(`subjects.${subject}`)}
                      </AdaptiveSubjectBadge>
                      <AdaptiveProgress value={pct} className="w-full" />
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span>
                          {tP("dashboard.mastered")}: {counts.mastered}
                        </span>
                        <span>
                          {tP("dashboard.total")}: {counts.total}
                        </span>
                      </div>
                      {counts.inProgress > 0 && (
                        <span className="text-xs text-blue-500">
                          {tP("dashboard.inProgress")}: {counts.inProgress}
                        </span>
                      )}
                      {counts.newError > 0 && (
                        <span className="text-xs text-red-500">
                          {tP("dashboard.newError")}: {counts.newError}
                        </span>
                      )}
                    </CardContent>
                  </AdaptiveCard>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: Historical Progress Chart ─ */}
      <section>
        <HistoricalProgressChart studentId={studentId ?? undefined} />
      </section>

      {/* ── Section 3: Learning Journey Timeline ─ */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {tP("journey.title")}
        </h2>

        {!journeyLoading && events.length === 0 ? (
          <AdaptiveCard>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              {tP("journey.empty")}
            </CardContent>
          </AdaptiveCard>
        ) : (
          <div className={cn(
            // flow/studio: left border timeline
            (tier === "flow" || tier === "studio") && "border-l-2 border-muted ml-3 pl-4",
            // cosmic: subtle glow border
            tier === "cosmic" && "border-l-2 border-primary/30 ml-3 pl-4",
            // wonder: no border, just stacked cards
            tier === "wonder" && "space-y-3",
          )}>
            {events.map((event, index) => (
              <motion.div
                key={`${event.type}-${event.timestamp}-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(index, 15) * 0.06,
                  duration: 0.3,
                }}
                className={cn(
                  tier === "wonder" ? "" : "relative mb-4",
                )}
              >
                {/* Timeline dot for non-wonder tiers */}
                {tier !== "wonder" && (
                  <div
                    className={cn(
                      "absolute -left-[calc(1rem+5px)] top-3 h-2.5 w-2.5 rounded-full",
                      EVENT_DOT_COLOR[event.type] ?? "bg-muted-foreground",
                      tier === "cosmic" && "shadow-[0_0_6px_var(--primary)]",
                    )}
                  />
                )}

                {tier === "wonder" ? (
                  // Wonder: large card with emoji
                  <AdaptiveCard>
                    <CardContent className="flex items-center gap-3 py-3">
                      <span className="text-2xl">
                        {EVENT_EMOJI[event.type] ?? "\uD83D\uDD39"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {tP(`journey.event.${event.type}`)}
                          {event.kpName && (
                            <span className="ml-1 text-muted-foreground">
                              {event.kpName}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(event.timestamp)}
                          {event.detail && event.type === "HOMEWORK_COMPLETED" && (
                            <span className="ml-2">
                              {tP("journey.score", { score: event.detail })}
                            </span>
                          )}
                        </p>
                      </div>
                    </CardContent>
                  </AdaptiveCard>
                ) : tier === "studio" ? (
                  // Studio: compact list row
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className="shrink-0 text-xs text-muted-foreground w-[72px]">
                      {formatDateShort(event.timestamp)}
                    </span>
                    <span className="font-medium">
                      {tP(`journey.event.${event.type}`)}
                    </span>
                    {event.kpName && (
                      <span className="text-muted-foreground truncate">
                        {event.kpName}
                      </span>
                    )}
                    {event.detail && event.type === "HOMEWORK_COMPLETED" && (
                      <span className="text-muted-foreground">
                        {tP("journey.score", { score: event.detail })}
                      </span>
                    )}
                  </div>
                ) : (
                  // Cosmic / Flow: card beside timeline
                  <AdaptiveCard>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">
                          {tP(`journey.event.${event.type}`)}
                        </span>
                        {event.kpName && (
                          <span className="text-muted-foreground truncate">
                            {event.kpName}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatDate(event.timestamp)}</span>
                        {event.subject && (
                          <AdaptiveSubjectBadge subject={event.subject}>
                            {tHw(`subjects.${event.subject}`)}
                          </AdaptiveSubjectBadge>
                        )}
                        {event.detail && event.type === "HOMEWORK_COMPLETED" && (
                          <span>{tP("journey.score", { score: event.detail })}</span>
                        )}
                      </div>
                    </CardContent>
                  </AdaptiveCard>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "2-digit",
    day: "2-digit",
  });
}
