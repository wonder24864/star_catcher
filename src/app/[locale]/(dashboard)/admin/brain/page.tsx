"use client";

/**
 * Learning Brain 监控页（Sprint 15 US-057 + Sprint 26 live updates）
 *
 * 三个 Tab：
 *   1. 执行历史 — AdminLog(action="brain-run") 分页 + filter + Sprint 26 实时流
 *   2. 学生状态 — 单学生最近 run + cooldown + cron
 *   3. 统计 — 最近 7 天聚合（总数/平均耗时/agent 分布/skipped top）+ Sprint 26 subscription 触发 invalidate
 *
 * Sprint 26 D62/D63/D68:
 *   - 页头常驻 LIVE indicator（subscription.status === "pending" → connected）
 *   - History tab subscription 新事件 prepend 到本地 liveItems，与分页结果按 id 去重合并
 *   - Stats tab subscription 命中时 utils.brain.stats.invalidate() 触发 CountUp 重播
 */

import { useState, useEffect, useRef } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { BrainRunEvent } from "@/lib/infra/events";
import { CountUp } from "@/components/pro";
import { LiveIndicator } from "@/components/admin/live-indicator";

type Tab = "history" | "student" | "stats";

function formatDateTime(d: Date | string, locale: string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function BrainMonitorPage() {
  const t = useTranslations("admin.brain");
  const locale = useLocale();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("history");
  // Sprint 26 D62/D63: shared live event bus between tabs, populated by the
  // global subscription below. Using a single subscription at the page level
  // (rather than per-tab) avoids opening/closing SSE connections on tab switch.
  const [liveEvents, setLiveEvents] = useState<BrainRunEvent[]>([]);
  // Sprint 26 D62: debounce stats invalidate. During `__all__` fan-out dozens
  // of events arrive in seconds; without debounce each triggers a 7-day
  // aggregate refetch while the Stats tab is open. 500ms coalesces the burst.
  const statsInvalidateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const subscription = trpc.brain.onBrainRunComplete.useSubscription(undefined, {
    onData: (event) => {
      setLiveEvents((prev) => {
        // Dedup by logId, keep newest 50 (plenty — listRuns page is 20)
        if (prev.some((e) => e.logId === event.logId)) return prev;
        return [event, ...prev].slice(0, 50);
      });
      if (statsInvalidateTimer.current) clearTimeout(statsInvalidateTimer.current);
      statsInvalidateTimer.current = setTimeout(() => {
        utils.brain.stats.invalidate();
      }, 500);
    },
  });

  // Clean up the pending debounce timer on unmount so we don't fire
  // invalidate against a disposed utils instance.
  useEffect(
    () => () => {
      if (statsInvalidateTimer.current) clearTimeout(statsInvalidateTimer.current);
    },
    [],
  );

  const isConnected = subscription.status === "pending";

  return (
    <div className="max-w-6xl space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
        </div>
        <LiveIndicator connected={isConnected} />
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b pb-2">
        {(["history", "student", "stats"] as Tab[]).map((tk) => (
          <Button
            key={tk}
            variant={tab === tk ? "default" : "ghost"}
            size="sm"
            onClick={() => setTab(tk)}
          >
            {t(`tabs.${tk}`)}
          </Button>
        ))}
      </div>

      {tab === "history" && <HistoryTab locale={locale} liveEvents={liveEvents} />}
      {tab === "student" && <StudentTab locale={locale} />}
      {tab === "stats" && <StatsTab />}
    </div>
  );
}

// ─── History Tab ───────────────────────────────────────────────

function HistoryTab({
  locale,
  liveEvents,
}: {
  locale: string;
  liveEvents: BrainRunEvent[];
}) {
  const t = useTranslations("admin.brain");
  const [studentId, setStudentId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [skippedOnly, setSkippedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Sprint 26 D63: track which items are "new" (just arrived via subscription)
  // so we can pulse them briefly. Items drop out of the set after 3s.
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const query = trpc.brain.listRuns.useQuery({
    studentId: studentId || undefined,
    dateFrom: dateFrom ? new Date(dateFrom) : undefined,
    dateTo: dateTo ? new Date(dateTo + "T23:59:59") : undefined,
    skippedOnly,
    page,
    pageSize: 20,
  });

  const rawItems = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  // Sprint 26 D63: merge live events (newest first) with paginated results,
  // deduped by id. Only apply on page 1 — older pages must not shift.
  const items = (() => {
    if (page !== 1) return rawItems;

    // Filter live events against current filters (studentId / dateFrom / dateTo / skippedOnly)
    const filtered = liveEvents.filter((e) => {
      if (studentId && e.studentId !== studentId) return false;
      if (dateFrom && new Date(e.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(e.createdAt) > new Date(dateTo + "T23:59:59")) return false;
      if (skippedOnly && !(e.agentsLaunched.length === 0 && e.skipped.length > 0))
        return false;
      return true;
    });

    const liveMapped = filtered.map((e) => ({
      id: e.logId,
      createdAt: new Date(e.createdAt),
      studentId: e.studentId,
      student: e.studentNickname
        ? { id: e.studentId, nickname: e.studentNickname, username: "" }
        : null,
      eventsProcessed: e.eventsProcessed,
      agentsLaunched: e.agentsLaunched,
      skipped: e.skipped,
      durationMs: e.durationMs,
      isSkipped: e.agentsLaunched.length === 0 && e.skipped.length > 0,
    }));

    const seen = new Set<string>();
    const merged: typeof rawItems = [];
    for (const it of [...liveMapped, ...rawItems]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      merged.push(it);
    }
    return merged.slice(0, 20);
  })();

  // Track which live ids should show the "new" pulse for 3 seconds
  useEffect(() => {
    if (liveEvents.length === 0) return;
    const latest = liveEvents[0];
    setFreshIds((prev) => {
      if (prev.has(latest.logId)) return prev;
      const next = new Set(prev);
      next.add(latest.logId);
      return next;
    });
    const id = latest.logId;
    const timer = setTimeout(() => {
      setFreshIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [liveEvents]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.studentId")}</Label>
          <Input
            value={studentId}
            onChange={(e) => {
              setStudentId(e.target.value);
              setPage(1);
            }}
            placeholder={t("filters.studentIdPlaceholder")}
            className="w-56"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.dateFrom")}</Label>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.dateTo")}</Label>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-40"
          />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="skippedOnly"
            checked={skippedOnly}
            onCheckedChange={(c) => {
              setSkippedOnly(c === true);
              setPage(1);
            }}
          />
          <Label htmlFor="skippedOnly" className="text-sm cursor-pointer">
            {t("filters.skippedOnly")}
          </Label>
        </div>
        {(studentId || dateFrom || dateTo || skippedOnly) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setStudentId("");
              setDateFrom("");
              setDateTo("");
              setSkippedOnly(false);
              setPage(1);
            }}
          >
            {t("filters.clear")}
          </Button>
        )}
      </div>

      {/* List */}
      {query.isLoading ? (
        <p className="text-muted-foreground">...</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="text-muted-foreground">{t("empty")}</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              // AnimatePresence initial={false} suppresses animation on the
              // component's first render for already-present items. Newly-keyed
              // items (live prepends) animate from here.
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
            <Card
              className={cn(
                "transition-shadow",
                freshIds.has(item.id) &&
                  "ring-2 ring-emerald-400/60 shadow-emerald-400/20 shadow-lg",
              )}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-3 text-sm">
                  <div className="w-44 shrink-0 text-muted-foreground">
                    {formatDateTime(item.createdAt, locale)}
                  </div>
                  <div className="w-32 shrink-0 truncate">
                    {item.student ? (
                      <Link
                        href={`/admin/users/${item.student.id}`}
                        className="hover:underline"
                      >
                        {item.student.nickname}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="w-16 shrink-0 text-right">{item.eventsProcessed}</div>
                  <div className="w-32 shrink-0 flex flex-wrap gap-1">
                    {item.agentsLaunched.length === 0 ? (
                      <span className="text-muted-foreground text-xs">
                        {t("agentsEmpty")}
                      </span>
                    ) : (
                      item.agentsLaunched.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {a.jobName.replace("-", " ")}
                        </Badge>
                      ))
                    )}
                  </div>
                  <div className="flex-1 text-xs text-muted-foreground">
                    {item.skipped.length > 0 && (
                      <span className="mr-1">
                        {t("skippedCount", { count: item.skipped.length })}:
                      </span>
                    )}
                    {item.skipped.slice(0, 2).map((s, i) => (
                      <span key={i} className="mr-2">
                        {s.jobName}({s.reason})
                      </span>
                    ))}
                  </div>
                  <div className="w-20 shrink-0 text-right text-muted-foreground">
                    {t("durationMs", { ms: item.durationMs })}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setExpandedId(expandedId === item.id ? null : item.id)
                    }
                  >
                    {expandedId === item.id ? "▴" : "▾"}
                  </Button>
                </div>

                {expandedId === item.id && (
                  <div className="mt-3 rounded bg-muted/40 p-3 text-xs">
                    <div className="mb-2 space-y-1">
                      <div>
                        <strong>Skipped:</strong>{" "}
                        {item.skipped.length === 0
                          ? "—"
                          : item.skipped.map((s, i) => (
                              <span key={i} className="mr-2">
                                {s.jobName} — {s.reason}
                              </span>
                            ))}
                      </div>
                      <div>
                        <strong>Launched:</strong>{" "}
                        {item.agentsLaunched.map((a, i) => (
                          <span key={i} className="mr-2">
                            {a.jobName} — {a.reason}
                          </span>
                        ))}
                      </div>
                    </div>
                    {item.studentId && (
                      <Link
                        href={`/admin/agent-traces?userId=${item.studentId}`}
                        className="text-blue-600 hover:underline"
                      >
                        → Agent Traces
                      </Link>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </motion.div>
          ))}
          </AnimatePresence>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ←
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Student Tab ───────────────────────────────────────────────

function StudentTab({ locale }: { locale: string }) {
  const t = useTranslations("admin.brain");
  const [input, setInput] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  const statusQuery = trpc.brain.studentStatus.useQuery(
    { studentId: query ?? "" },
    { enabled: query !== null && query.length > 0, retry: false },
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs text-muted-foreground">{t("searchLabel")}</Label>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("searchPlaceholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") setQuery(input.trim() || null);
              }}
            />
          </div>
          <Button onClick={() => setQuery(input.trim() || null)}>{t("query")}</Button>
        </CardContent>
      </Card>

      {query && statusQuery.isError && (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <p className="text-muted-foreground">{t("notFound")}</p>
        </div>
      )}

      {statusQuery.data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{statusQuery.data.student.nickname}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <strong>{t("cooldown")}:</strong>{" "}
                {statusQuery.data.cooldownSeconds !== null
                  ? t("cooldownActive", { seconds: statusQuery.data.cooldownSeconds })
                  : t("cooldownNone")}
              </div>
              {statusQuery.data.brainSchedule && (
                <div>
                  <strong>{t("nextCron")}:</strong>{" "}
                  {t("cronPattern", { pattern: statusQuery.data.brainSchedule.pattern })}{" "}
                  <span className="text-muted-foreground">
                    ({statusQuery.data.brainSchedule.timezone})
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("recentRuns")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {statusQuery.data.recentRuns.length === 0 ? (
                <p className="text-muted-foreground">{t("noRecentRuns")}</p>
              ) : (
                statusQuery.data.recentRuns.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 border-b pb-2 last:border-b-0"
                  >
                    <span className="text-muted-foreground w-44 shrink-0">
                      {formatDateTime(r.createdAt, locale)}
                    </span>
                    <span className="w-16 shrink-0">{r.eventsProcessed}</span>
                    <div className="flex flex-wrap gap-1 flex-1">
                      {r.agentsLaunched.map((a, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {a.jobName}
                        </Badge>
                      ))}
                      {r.agentsLaunched.length === 0 && (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </div>
                    <span className="text-muted-foreground w-20 text-right">
                      {r.durationMs} ms
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ─── Stats Tab ─────────────────────────────────────────────────

function StatsTab() {
  const t = useTranslations("admin.brain");
  const query = trpc.brain.stats.useQuery({ days: 7 });

  if (query.isLoading) return <p className="text-muted-foreground">...</p>;
  if (!query.data) return <p className="text-muted-foreground">{t("statsEmpty")}</p>;

  const { days, totalRuns, uniqueStudents, avgDurationMs, agentDistribution, topSkippedReasons } =
    query.data;

  const maxAgent = agentDistribution[0]?.count ?? 1;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("statsTitle", { days })}</p>

      {/* Top cards — Sprint 26: CountUp replays on query invalidate */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("totalRuns")}</div>
            <div className="text-2xl font-bold">
              <CountUp end={totalRuns} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("uniqueStudents")}</div>
            <div className="text-2xl font-bold">
              <CountUp end={uniqueStudents} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t("avgDuration")}</div>
            <div className="text-2xl font-bold">
              <CountUp end={avgDurationMs} /> ms
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Agent distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("agentDistribution")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {agentDistribution.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("statsEmpty")}</p>
          ) : (
            agentDistribution.map((a) => (
              <div key={a.agentName} className="flex items-center gap-3 text-sm">
                <span className="w-40 shrink-0">{a.agentName}</span>
                <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                  <div
                    className="h-full bg-blue-500"
                    style={{ width: `${(a.count / maxAgent) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right text-muted-foreground">{a.count}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Top skipped reasons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("topSkipped")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {topSkippedReasons.length === 0 ? (
            <p className="text-muted-foreground">{t("statsEmpty")}</p>
          ) : (
            topSkippedReasons.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b py-1 last:border-b-0">
                <span className="font-mono text-xs">{r.reason}</span>
                <Badge variant="secondary">{r.count}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
