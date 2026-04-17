"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { CalendarDays } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Badge } from "@/components/ui/badge";
import { GlassCard, GradientMesh, StatusPulse } from "@/components/pro";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function getParentGreeting(t: ReturnType<typeof useTranslations>): string {
  const hour = new Date().getHours();
  if (hour < 6) return t("student.greeting.lateNight");
  if (hour < 11) return t("student.greeting.morning");
  if (hour < 14) return t("student.greeting.noon");
  if (hour < 18) return t("student.greeting.afternoon");
  return t("student.greeting.evening");
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/** Return "YYYY-MM-DD" of the Monday of the week containing the given date */
function getMondayStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

const WEEK_LABELS_ZH = ["一", "二", "三", "四", "五", "六", "日"];

export default function ParentOverviewPage() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();

  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Init date from URL `?date=` (Sprint 25 D59 drill-down); fallback to today.
  const [date, setDate] = useState(() => {
    const fromUrl = searchParams?.get("date");
    if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) return fromUrl;
    return todayStr();
  });

  const [isDatePending, startDateTransition] = useTransition();

  const updateDate = useCallback(
    (next: string) => {
      startDateTransition(() => {
        setDate(next);
        const params = new URLSearchParams(searchParams?.toString() ?? "");
        params.set("date", next);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router, pathname],
  );

  // Fetch students so we can auto-select first
  const { data: students } = trpc.family.students.useQuery();
  const effectiveStudentId = selectedStudentId || students?.[0]?.id || null;

  // Auto-persist first student to store so selector stays in sync
  useEffect(() => {
    if (!selectedStudentId && students?.[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [selectedStudentId, students, setSelectedStudentId]);

  const weekStart = getMondayStr(date);

  const { data: sessions, isLoading } = trpc.parent.overview.useQuery(
    { studentId: effectiveStudentId!, date },
    { enabled: !!effectiveStudentId },
  );

  const { data: weeklyData } = trpc.parent.weeklyCheckin.useQuery(
    { studentId: effectiveStudentId!, weekStart },
    { enabled: !!effectiveStudentId },
  );

  if (!effectiveStudentId) {
    return (
      <div className="max-w-3xl pt-12 md:pt-0">
        <h1 className="text-2xl font-bold">{t("parent.overview.title")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("homework.selectStudent")}
        </p>
      </div>
    );
  }

  const selectedStudent = students?.find((s) => s.id === effectiveStudentId);
  const greeting = getParentGreeting(t);

  return (
    <div className="relative min-h-full pt-12 md:pt-0">
      <GradientMesh className="rounded-xl" />

      <div className="relative max-w-3xl space-y-6">
        {/* Hero header: greeting + who we're viewing + date picker */}
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="rounded-2xl border bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-sky-950/30 p-5 sm:p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">{greeting}</p>
              <h1 className="mt-0.5 text-2xl sm:text-3xl font-bold truncate">
                {t("parent.overview.title")}
              </h1>
              {selectedStudent && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="secondary"
                    className="font-normal bg-white/60 dark:bg-white/10 backdrop-blur-sm"
                  >
                    {t("user.myStudents")}: {selectedStudent.nickname}
                  </Badge>
                  {selectedStudent.grade && (
                    <Badge
                      variant="outline"
                      className="font-normal"
                    >
                      {t(`grades.${selectedStudent.grade}` as never)}
                    </Badge>
                  )}
                </div>
              )}
            </div>
            <label className="relative inline-flex items-center gap-2 self-start sm:self-auto">
              <CalendarDays className="pointer-events-none absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="date"
                value={date}
                max={todayStr()}
                onChange={(e) => updateDate(e.target.value)}
                className="rounded-md border bg-white/80 dark:bg-background/60 backdrop-blur-sm pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          </div>
        </motion.div>

        {/* Weekly check-in calendar */}
        {weeklyData && (
          <GlassCard intensity="medium" glow="subtle" className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {t("parent.overview.weeklyCheckin")}
            </h2>
            <div className="grid grid-cols-7 gap-1 text-center">
              {weeklyData.map((day, i) => (
                <div
                  key={day.date}
                  className="flex flex-col items-center gap-0.5"
                >
                  <span className="text-xs text-muted-foreground">
                    {WEEK_LABELS_ZH[i]}
                  </span>
                  <button
                    onClick={() => updateDate(day.date)}
                    disabled={isDatePending && day.date !== date}
                    className={cn(
                      "h-8 w-8 rounded-full text-xs font-medium transition-colors active:scale-95 disabled:opacity-60",
                      day.date === date
                        ? "bg-primary text-primary-foreground"
                        : day.hasSession
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {parseInt(day.date.slice(8), 10)}
                  </button>
                  <div
                    className={cn(
                      "h-1 w-1 rounded-full",
                      day.hasSession ? "bg-green-500" : "invisible",
                    )}
                  />
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Session list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : !sessions || sessions.length === 0 ? (
          <GlassCard
            intensity="subtle"
            glow="none"
            className="border border-dashed p-8 text-center"
          >
            <p className="text-muted-foreground">
              {t("parent.overview.noSessions")}
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const helpLevels = [1, 2, 3].filter(
                (l) => session.helpByLevel[l] != null,
              );
              return (
                <Link key={session.id} href={`/parent/sessions/${session.id}`}>
                  <GlassCard
                    intensity="subtle"
                    glow="subtle"
                    className="cursor-pointer p-4 hover:bg-accent/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        {/* Title + subject */}
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {session.title ?? t("homework.untitled")}
                          </span>
                          {session.subject && (
                            <Badge variant="secondary" className="text-xs">
                              {t(`homework.subjects.${session.subject}`)}
                            </Badge>
                          )}
                        </div>

                        {/* Stats row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                          <span>
                            {new Date(session.createdAt).toLocaleTimeString(
                              "zh-CN",
                              {
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </span>
                          {session.finalScore != null && (
                            <span className="font-medium text-foreground">
                              {t("homework.score", {
                                score: session.finalScore,
                              })}
                            </span>
                          )}
                          {session.totalRounds > 0 && (
                            <span>
                              {t("parent.overview.rounds", {
                                count: session.totalRounds,
                              })}
                            </span>
                          )}
                        </div>

                        {/* Help stats */}
                        {helpLevels.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">
                              {t("parent.overview.helpStats")}:
                            </span>
                            {helpLevels.map((level) => (
                              <Badge
                                key={level}
                                variant="outline"
                                className="text-xs"
                              >
                                L{level} × {session.helpByLevel[level]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Status indicator + badge */}
                      <div className="flex shrink-0 items-center gap-2">
                        <StatusPulse
                          status={
                            session.status === "COMPLETED"
                              ? "idle"
                              : "processing"
                          }
                          size="sm"
                        />
                        <Badge
                          variant={
                            session.status === "COMPLETED"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {t(`homework.status.${session.status}`)}
                        </Badge>
                      </div>
                    </div>
                  </GlassCard>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
