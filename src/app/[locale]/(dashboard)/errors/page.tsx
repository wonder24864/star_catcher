"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { MathText } from "@/components/ui/math-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SUBJECTS = [
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
] as const;

const SUBJECT_COLORS: Record<string, string> = {
  MATH: "bg-blue-100 text-blue-800",
  CHINESE: "bg-red-100 text-red-800",
  ENGLISH: "bg-green-100 text-green-800",
  PHYSICS: "bg-purple-100 text-purple-800",
  CHEMISTRY: "bg-yellow-100 text-yellow-800",
  BIOLOGY: "bg-teal-100 text-teal-800",
  POLITICS: "bg-orange-100 text-orange-800",
  HISTORY: "bg-amber-100 text-amber-800",
  GEOGRAPHY: "bg-cyan-100 text-cyan-800",
  OTHER: "bg-gray-100 text-gray-800",
};

export default function ErrorsPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);

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
        <h1 className="text-2xl font-bold">{t("homework.errors" as never) || t("nav.errors")}</h1>
        <p className="text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{t("nav.errors")}</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder={t("common.search")}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
        </div>
        <Button variant="outline" onClick={handleSearch}>
          {t("common.search")}
        </Button>

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
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-muted-foreground">{t("common.loading")}</p>
      ) : !data || data.items.length === 0 ? (
        <p className="text-muted-foreground">{t("common.noData")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total} 条错题
          </p>
          <div className="space-y-2">
            {data.items.map((eq) => (
              <Link key={eq.id} href={`/errors/${eq.id}`}>
                <Card className="hover:bg-accent/30 transition-colors cursor-pointer">
                  <CardContent className="py-3 px-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          className={
                            SUBJECT_COLORS[eq.subject] ||
                            SUBJECT_COLORS.OTHER
                          }
                        >
                          {t(`homework.subjects.${eq.subject}`)}
                        </Badge>
                        {eq.isMastered && (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            已掌握
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm line-clamp-2 text-foreground">
                        <MathText text={eq.content} />
                      </p>
                      {eq.aiKnowledgePoint && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("homework.knowledgePoint")}: {eq.aiKnowledgePoint}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-muted-foreground shrink-0">
                      <p>{new Date(eq.createdAt).toLocaleDateString()}</p>
                      <p className="mt-1">
                        {t("homework.check.round", { round: eq.totalAttempts })} 次
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {data.totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("common.back")}
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
