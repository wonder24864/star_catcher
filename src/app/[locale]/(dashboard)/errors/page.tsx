"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{tT("title")}</h1>

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
