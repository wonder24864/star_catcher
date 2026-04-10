"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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
  const [date, setDate] = useState(todayStr);

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
    { enabled: !!effectiveStudentId }
  );

  const { data: weeklyData } = trpc.parent.weeklyCheckin.useQuery(
    { studentId: effectiveStudentId!, weekStart },
    { enabled: !!effectiveStudentId }
  );

  if (!effectiveStudentId) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-bold">{t("parent.overview.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("parent.overview.title")}</h1>
        <input
          type="date"
          value={date}
          max={todayStr()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Weekly check-in calendar */}
      {weeklyData && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("parent.overview.weeklyCheckin")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center">
              {weeklyData.map((day, i) => (
                <div key={day.date} className="flex flex-col items-center gap-0.5">
                  <span className="text-xs text-muted-foreground">
                    {WEEK_LABELS_ZH[i]}
                  </span>
                  <button
                    onClick={() => setDate(day.date)}
                    className={cn(
                      "h-8 w-8 rounded-full text-xs font-medium transition-colors",
                      day.date === date
                        ? "bg-primary text-primary-foreground"
                        : day.hasSession
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "text-muted-foreground hover:bg-accent"
                    )}
                  >
                    {parseInt(day.date.slice(8), 10)}
                  </button>
                  <div
                    className={cn(
                      "h-1 w-1 rounded-full",
                      day.hasSession ? "bg-green-500" : "invisible"
                    )}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session list */}
      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : !sessions || sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("parent.overview.noSessions")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const helpLevels = [1, 2, 3].filter(
              (l) => session.helpByLevel[l] != null
            );
            return (
              <Link key={session.id} href={`/parent/sessions/${session.id}`}>
              <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
                <CardContent className="p-4">
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
                          {new Date(session.createdAt).toLocaleTimeString("zh-CN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {session.finalScore != null && (
                          <span className="font-medium text-foreground">
                            {t("homework.score", { score: session.finalScore })}
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

                    {/* Status badge */}
                    <Badge
                      variant={
                        session.status === "COMPLETED" ? "default" : "secondary"
                      }
                      className="shrink-0"
                    >
                      {t(`homework.status.${session.status}`)}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
