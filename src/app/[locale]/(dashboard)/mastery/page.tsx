"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { useTier } from "@/components/providers/grade-tier-provider";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReviewDialog } from "@/components/mastery/review-dialog";
import { AgentSummaryCard } from "@/components/agent-summary-card";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveProgress } from "@/components/adaptive/adaptive-progress";
import { HistoricalProgressChart } from "@/components/profile/historical-progress-chart";

const SUBJECTS = [
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
] as const;

const STATUS_BADGE_STYLES: Record<string, string> = {
  NEW_ERROR: "bg-red-100 text-red-800 border-red-200",
  CORRECTED: "bg-orange-100 text-orange-800 border-orange-200",
  REVIEWING: "bg-blue-100 text-blue-800 border-blue-200",
  MASTERED: "bg-green-100 text-green-800 border-green-200",
  REGRESSED: "bg-purple-100 text-purple-800 border-purple-200",
};

const STATUS_FILTERS = ["ALL", "WEAK", "MASTERED", "NEW_ERROR", "OVERDUE"] as const;

type MasteryItem = {
  id: string;
  knowledgePointId: string;
  knowledgePointName: string;
  subject: string;
  grade: string | null;
  difficulty: number;
  parentName: string | null;
  status: string;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: Date | null;
  masteredAt: Date | null;
  nextReviewAt: Date | string | null;
};

export default function MasteryPage() {
  const t = useTranslations("mastery");
  const tCommon = useTranslations("common");
  const tT = useTierTranslations("mastery");
  const tLP = useTierTranslations("learningProfile");
  const locale = useLocale();
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);
  const searchParams = useSearchParams();
  const { tierIndex } = useTier();

  const isParent = session?.user?.role === "PARENT";
  const studentId = isParent ? selectedStudentId : session?.user?.id;

  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedKP, setSelectedKP] = useState<string | null>(null);
  const [reviewKP, setReviewKP] = useState<string | null>(null);

  // Handle URL query params for deep linking (?review=<kpId> or ?filter=OVERDUE)
  useEffect(() => {
    const reviewParam = searchParams.get("review");
    const filterParam = searchParams.get("filter");
    if (reviewParam) setReviewKP(reviewParam);
    if (filterParam && STATUS_FILTERS.includes(filterParam as typeof STATUS_FILTERS[number])) {
      setStatusFilter(filterParam);
    }
  }, [searchParams]);

  // Map status filter to query params
  const queryStatus = statusFilter === "ALL" || statusFilter === "WEAK" || statusFilter === "OVERDUE"
    ? undefined
    : (statusFilter as "NEW_ERROR" | "CORRECTED" | "REVIEWING" | "MASTERED" | "REGRESSED");

  const { data, isLoading } = trpc.mastery.list.useQuery(
    {
      studentId: isParent ? (studentId ?? undefined) : undefined,
      subject: subjectFilter === "ALL" ? undefined : subjectFilter,
      status: queryStatus,
      page: 1,
      limit: 100,
    },
    { enabled: !!studentId },
  );

  const { data: stats } = trpc.mastery.stats.useQuery(
    { studentId: isParent ? (studentId ?? undefined) : undefined },
    { enabled: !!studentId },
  );

  const { data: todayReviews } = trpc.mastery.todayReviews.useQuery(
    { studentId: isParent ? (studentId ?? undefined) : undefined },
    { enabled: !!studentId },
  );

  const { data: detail } = trpc.mastery.detail.useQuery(
    {
      studentId: isParent ? (studentId ?? undefined) : undefined,
      knowledgePointId: selectedKP!,
    },
    { enabled: !!selectedKP && !!studentId },
  );

  const { data: kpAgentTrace } = trpc.agentTrace.latestForKnowledgePoint.useQuery(
    {
      studentId: isParent ? (studentId ?? undefined) : undefined,
      knowledgePointId: selectedKP!,
    },
    { enabled: !!selectedKP && !!studentId },
  );

  const now = new Date();

  // Client-side filters
  const weakStatuses = new Set(["NEW_ERROR", "CORRECTED", "REGRESSED"]);
  const overdueKPIds = new Set(
    todayReviews?.items?.map((r: { knowledgePointId: string }) => r.knowledgePointId) ?? [],
  );

  const filteredItems = data?.items?.filter((item: MasteryItem) => {
    if (statusFilter === "WEAK") return weakStatuses.has(item.status);
    if (statusFilter === "OVERDUE") return overdueKPIds.has(item.knowledgePointId);
    return true;
  }) ?? [];

  // Stats summary
  const weakCount = stats?.byStatus
    .filter((s: { status: string; count: number }) => weakStatuses.has(s.status))
    .reduce((sum: number, s: { count: number }) => sum + s.count, 0) ?? 0;
  const masteredCount = stats?.byStatus
    .find((s: { status: string }) => s.status === "MASTERED")?.count ?? 0;
  const newErrorCount = stats?.byStatus
    .find((s: { status: string }) => s.status === "NEW_ERROR")?.count ?? 0;
  const overdueCount = todayReviews?.count ?? 0;

  function isOverdue(item: MasteryItem): boolean {
    if (!item.nextReviewAt) return false;
    return new Date(item.nextReviewAt) <= now;
  }

  // D41: Tier-branched grid layout
  const gridClass =
    tierIndex === 1
      ? "space-y-4"                           // wonder: single column, large cards
      : tierIndex === 2
        ? "grid grid-cols-2 gap-3"            // cosmic: two-column
        : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3"; // flow/studio: three-column

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header + View Profile link */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{tT("title")}</h1>
        <Link href={`/${locale}/student/profile`}>
          <AdaptiveButton variant="outline" size="sm">
            {tLP("viewProfile")}
          </AdaptiveButton>
        </Link>
      </div>

      {/* Stats Summary — D45: keep semantic colors, wrap in AdaptiveCard */}
      <div className="flex gap-3 overflow-x-auto">
        <AdaptiveCard className="min-w-[100px] flex-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{weakCount}</div>
            <div className="text-xs text-muted-foreground">{tT("stats.weak")}</div>
          </CardContent>
        </AdaptiveCard>
        <AdaptiveCard className="min-w-[100px] flex-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{masteredCount}</div>
            <div className="text-xs text-muted-foreground">{tT("stats.mastered")}</div>
          </CardContent>
        </AdaptiveCard>
        <AdaptiveCard className="min-w-[100px] flex-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{newErrorCount}</div>
            <div className="text-xs text-muted-foreground">{tT("stats.newError")}</div>
          </CardContent>
        </AdaptiveCard>
        {overdueCount > 0 && (
          <AdaptiveCard className="min-w-[100px] flex-1 border-red-200">
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
              <div className="text-xs text-muted-foreground">{tT("overdueBadge")}</div>
            </CardContent>
          </AdaptiveCard>
        )}
      </div>

      {/* Historical Progress Chart (D48: shared component) */}
      <HistoricalProgressChart studentId={studentId ?? undefined} />

      {/* Subject Tabs */}
      <Tabs value={subjectFilter} onValueChange={setSubjectFilter}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="ALL">{tCommon("all")}</TabsTrigger>
          {SUBJECTS.map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`subjects.${s}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Status Filter */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <AdaptiveButton
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f)}
          >
            {f === "OVERDUE" ? tT("overdueBadge") : t(`filters.${f}` as `filters.ALL`)}
            {f === "OVERDUE" && overdueCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 rounded-full p-0 text-[10px]">
                {overdueCount}
              </Badge>
            )}
          </AdaptiveButton>
        ))}
      </div>

      {/* Knowledge Point Cards */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          {tCommon("loading")}
        </div>
      ) : filteredItems.length === 0 ? (
        <AdaptiveCard>
          <CardContent className="py-12 text-center">
            <p className="text-lg text-muted-foreground">{tT("empty")}</p>
          </CardContent>
        </AdaptiveCard>
      ) : (
        <div className={gridClass}>
          {filteredItems.map((item: MasteryItem, index: number) => {
            const accuracy = item.totalAttempts > 0
              ? Math.round((item.correctAttempts / item.totalAttempts) * 100)
              : 0;
            const overdue = isOverdue(item);

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: Math.min(index, 15) * 0.06, // D46: cap stagger at 15 items
                  duration: 0.25,
                  ease: "easeOut",
                }}
              >
                <AdaptiveCard
                  className={`cursor-pointer ${overdue ? "border-red-300" : ""}`}
                  onClick={() => setSelectedKP(item.knowledgePointId)}
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-medium leading-tight">
                          {item.knowledgePointName}
                        </h3>
                        {item.parentName && (
                          <span className="text-xs text-muted-foreground">
                            {item.parentName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {overdue && (
                          <Badge variant="destructive" className="text-[10px]">
                            {tT("overdueBadge")}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className={STATUS_BADGE_STYLES[item.status] ?? ""}
                        >
                          {t(`status.${item.status}`)}
                        </Badge>
                      </div>
                    </div>

                    {/* Accuracy — AdaptiveProgress replaces manual bar */}
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{t("accuracy")}</span>
                        <span>{accuracy}%</span>
                      </div>
                      <AdaptiveProgress value={accuracy} />
                    </div>

                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t("attempts", { count: item.totalAttempts })}
                      </span>
                      {item.status === "REVIEWING" && item.nextReviewAt && (
                        <span>
                          {t("nextReview", {
                            date: new Date(item.nextReviewAt).toLocaleDateString(),
                          })}
                        </span>
                      )}
                    </div>

                    {/* Start Review button for overdue items */}
                    {overdue && !isParent && (
                      <AdaptiveButton
                        size="sm"
                        className="mt-3 w-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReviewKP(item.knowledgePointId);
                        }}
                      >
                        {tT("startReview")}
                      </AdaptiveButton>
                    )}
                  </CardContent>
                </AdaptiveCard>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedKP} onOpenChange={(open: boolean) => !open && setSelectedKP(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.knowledgePoint.name ?? ""}</DialogTitle>
          </DialogHeader>

          {detail && (
            <div className="mt-4 space-y-4">
              {/* Mastery Info */}
              <div className="space-y-2">
                <Badge
                  variant="outline"
                  className={STATUS_BADGE_STYLES[detail.mastery.status] ?? ""}
                >
                  {t(`status.${detail.mastery.status}`)}
                </Badge>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">{t("detail.attempts")}</span>
                  <span>{detail.mastery.totalAttempts}</span>
                  <span className="text-muted-foreground">{t("detail.correct")}</span>
                  <span>{detail.mastery.correctAttempts}</span>
                  <span className="text-muted-foreground">{t("detail.difficulty")}</span>
                  <span>{detail.knowledgePoint.difficulty}/5</span>
                </div>
              </div>

              {/* Agent Analysis Summary */}
              <AgentSummaryCard trace={kpAgentTrace} />

              {/* Intervention History */}
              {detail.interventions.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">{t("detail.interventions")}</h4>
                  <div className="space-y-2">
                    {detail.interventions.map((intervention: { id: string; type: string; createdAt: Date }) => (
                      <div
                        key={intervention.id}
                        className="rounded-md border p-2 text-sm"
                      >
                        <div className="flex justify-between">
                          <Badge variant="secondary" className="text-xs">
                            {t(`interventionType.${intervention.type}`)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(intervention.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Questions */}
              {detail.errorQuestions.length > 0 && (
                <div>
                  <h4 className="mb-2 font-medium">{t("detail.errorQuestions")}</h4>
                  <div className="space-y-2">
                    {detail.errorQuestions.map((eq: { id: string; content: string; studentAnswer: string | null; correctAnswer: string | null; createdAt: Date }) => (
                      <div
                        key={eq.id}
                        className="rounded-md border p-2 text-sm"
                      >
                        <p className="line-clamp-2">{eq.content}</p>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {new Date(eq.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <ReviewDialog
        knowledgePointId={reviewKP}
        onClose={() => setReviewKP(null)}
      />
    </div>
  );
}
