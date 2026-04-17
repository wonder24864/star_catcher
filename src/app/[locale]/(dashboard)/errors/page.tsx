"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { useTier } from "@/components/providers/grade-tier-provider";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { SUBJECTS } from "@/lib/constants/subject-colors";
import { Input } from "@/components/ui/input";
import { CardContent } from "@/components/ui/card";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { ErrorItem } from "@/components/errors/error-item";
import { SessionGroup } from "@/components/errors/session-group";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ViewMode = "grouped" | "flat";

export default function ErrorsPage() {
  const t = useTranslations();
  const tT = useTierTranslations("errors");
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);
  const { tierIndex } = useTier();

  const isParent = session?.user?.role === "PARENT";
  const studentId = isParent ? selectedStudentId : session?.user?.id;

  const [subject, setSubject] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  // "grouped": errors bucketed under their homework session card (default).
  // "flat":    classic list used for quick scans / keyword search.
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  const { data, isLoading } = trpc.error.list.useQuery(
    {
      studentId: isParent ? (studentId ?? undefined) : undefined,
      subject: subject || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      search: search || undefined,
      page,
    } as Parameters<typeof trpc.error.list.useQuery>[0],
    { enabled: !!studentId }
  );

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  function handleSubjectChange(val: string) {
    setSubject(val === "ALL" ? "" : val);
    setPage(1);
  }

  function handleDateChange(field: "from" | "to", val: string) {
    if (field === "from") setDateFrom(val);
    else setDateTo(val);
    setPage(1);
  }

  if (isParent && !selectedStudentId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("nav.errors")}</h1>
        <p className="text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  // Tier-branched list layout: wonder=single column large, others=compact
  const listClass = tierIndex === 1 ? "space-y-4" : "space-y-2";

  // Group items by sessionId for the grouped view. Preserves DB ordering
  // (newest sessions first). Errors without a sessionQuestion land under a
  // stable "manual" bucket so they don't disappear.
  type Item = NonNullable<typeof data>["items"][number];
  type SessionInfo = NonNullable<Item["session"]>;
  const groups = useMemo<Array<{ session: SessionInfo | null; items: Item[] }>>(() => {
    if (!data?.items) return [];
    const bySessionId = new Map<string, { session: SessionInfo | null; items: Item[] }>();
    for (const eq of data.items) {
      const key = eq.session?.id ?? "__manual__";
      const existing = bySessionId.get(key);
      if (existing) {
        existing.items.push(eq);
      } else {
        bySessionId.set(key, { session: eq.session, items: [eq] });
      }
    }
    return Array.from(bySessionId.values());
  }, [data?.items]);

  return (
    <div className="space-y-4 pt-12 md:pt-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{tT("title")}</h1>
        {/* View-mode toggle (grouped / flat). Kept minimal — a small segmented
            switch — so it doesn't dominate the page header. */}
        <div className="inline-flex rounded-md border bg-background p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setViewMode("grouped")}
            aria-pressed={viewMode === "grouped"}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors",
              viewMode === "grouped"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("errors.view.grouped")}</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("flat")}
            aria-pressed={viewMode === "flat"}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2.5 py-1 transition-colors",
              viewMode === "flat"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ListIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("errors.view.flat")}</span>
          </button>
        </div>
      </div>

      {/* Filters — wonder tier hides date pickers (D43) */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder={t("common.search")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <AdaptiveButton variant="outline" onClick={handleSearch}>
          {t("common.search")}
        </AdaptiveButton>

        <Select value={subject || "ALL"} onValueChange={handleSubjectChange}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("common.filter")}</SelectItem>
            {SUBJECTS.map((s) => (
              <SelectItem key={s} value={s}>
                {t(`homework.subjects.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Date pickers: hidden for wonder tier to reduce cognitive load */}
        {tierIndex >= 2 && (
          <>
            <Input
              type="date"
              className="w-40"
              value={dateFrom}
              onChange={(e) => handleDateChange("from", e.target.value)}
            />
            <Input
              type="date"
              className="w-40"
              value={dateTo}
              onChange={(e) => handleDateChange("to", e.target.value)}
            />
          </>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <AdaptiveCard>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-muted-foreground">{tT("noData")}</p>
          </CardContent>
        </AdaptiveCard>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {tT("errorCount", { count: data.total })}
          </p>

          {viewMode === "grouped" ? (
            <div className="space-y-3">
              {groups.map((g, i) => (
                <SessionGroup
                  key={g.session?.id ?? `manual-${i}`}
                  session={g.session}
                  items={g.items}
                  defaultOpen={i === 0}
                />
              ))}
            </div>
          ) : (
            <div className={listClass}>
              {data.items.map((eq, index) => (
                <motion.div
                  key={eq.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: Math.min(index, 15) * 0.06,
                    duration: 0.25,
                    ease: "easeOut",
                  }}
                >
                  <ErrorItem eq={eq} />
                </motion.div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <AdaptiveButton
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("common.back")}
              </AdaptiveButton>
              <span className="text-sm text-muted-foreground">
                {page} / {data.totalPages}
              </span>
              <AdaptiveButton
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")}
              </AdaptiveButton>
            </div>
          )}
        </>
      )}
    </div>
  );
}
