"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const SUBJECTS = [
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
] as const;

const STATUS_COLORS: Record<string, string> = {
  NEW_ERROR: "bg-red-500",
  CORRECTED: "bg-orange-500",
  REVIEWING: "bg-blue-500",
  MASTERED: "bg-green-500",
  REGRESSED: "bg-purple-500",
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  NEW_ERROR: "bg-red-100 text-red-800 border-red-200",
  CORRECTED: "bg-orange-100 text-orange-800 border-orange-200",
  REVIEWING: "bg-blue-100 text-blue-800 border-blue-200",
  MASTERED: "bg-green-100 text-green-800 border-green-200",
  REGRESSED: "bg-purple-100 text-purple-800 border-purple-200",
};

const STATUS_FILTERS = ["ALL", "WEAK", "MASTERED", "NEW_ERROR"] as const;

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
};

export default function MasteryPage() {
  const t = useTranslations("mastery");
  const tCommon = useTranslations("common");
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);

  const isParent = session?.user?.role === "PARENT";
  const studentId = isParent ? selectedStudentId : session?.user?.id;

  const [subjectFilter, setSubjectFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedKP, setSelectedKP] = useState<string | null>(null);

  // Map status filter to query params
  const queryStatus = statusFilter === "ALL"
    ? undefined
    : statusFilter === "WEAK"
      ? undefined // Handle client-side
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

  const { data: detail } = trpc.mastery.detail.useQuery(
    {
      studentId: isParent ? (studentId ?? undefined) : undefined,
      knowledgePointId: selectedKP!,
    },
    { enabled: !!selectedKP && !!studentId },
  );

  // Client-side filter for WEAK (NEW_ERROR + CORRECTED + REGRESSED)
  const weakStatuses = new Set(["NEW_ERROR", "CORRECTED", "REGRESSED"]);
  const filteredItems = data?.items?.filter((item: MasteryItem) => {
    if (statusFilter === "WEAK") return weakStatuses.has(item.status);
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

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {/* Stats Summary */}
      <div className="flex gap-3 overflow-x-auto">
        <Card className="min-w-[120px] flex-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{weakCount}</div>
            <div className="text-xs text-muted-foreground">{t("stats.weak")}</div>
          </CardContent>
        </Card>
        <Card className="min-w-[120px] flex-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{masteredCount}</div>
            <div className="text-xs text-muted-foreground">{t("stats.mastered")}</div>
          </CardContent>
        </Card>
        <Card className="min-w-[120px] flex-1">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{newErrorCount}</div>
            <div className="text-xs text-muted-foreground">{t("stats.newError")}</div>
          </CardContent>
        </Card>
      </div>

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
      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <Button
            key={f}
            variant={statusFilter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f)}
          >
            {t(`filters.${f}`)}
          </Button>
        ))}
      </div>

      {/* Knowledge Point Cards */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          {tCommon("loading")}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map((item: MasteryItem) => {
            const accuracy = item.totalAttempts > 0
              ? Math.round((item.correctAttempts / item.totalAttempts) * 100)
              : 0;

            return (
              <Card
                key={item.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
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
                    <Badge
                      variant="outline"
                      className={STATUS_BADGE_STYLES[item.status] ?? ""}
                    >
                      {t(`status.${item.status}`)}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{t("accuracy")}</span>
                      <span>{accuracy}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${accuracy}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>
                      {t("attempts", { count: item.totalAttempts })}
                    </span>
                    <span className={`h-2 w-2 rounded-full ${STATUS_COLORS[item.status] ?? ""}`} />
                  </div>
                </CardContent>
              </Card>
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
    </div>
  );
}
