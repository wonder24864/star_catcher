"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function ParentSuggestionsPage() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");

  const { data: students } = trpc.family.students.useQuery();
  const effectiveStudentId = selectedStudentId || students?.[0]?.id || null;

  useEffect(() => {
    if (!selectedStudentId && students?.[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [selectedStudentId, students, setSelectedStudentId]);

  const { data: suggestionsData, isLoading: suggestionsLoading } =
    trpc.parent.getLearningSuggestions.useQuery(
      { studentId: effectiveStudentId!, limit: 5 },
      { enabled: !!effectiveStudentId }
    );

  const { data: effectData, isLoading: effectLoading } =
    trpc.parent.interventionEffect.useQuery(
      { studentId: effectiveStudentId!, period },
      { enabled: !!effectiveStudentId }
    );

  const { data: timelineData, isLoading: timelineLoading } =
    trpc.parent.interventionTimeline.useQuery(
      { studentId: effectiveStudentId!, limit: 20 },
      { enabled: !!effectiveStudentId }
    );

  const utils = trpc.useUtils();
  const requestMutation = trpc.parent.requestLearningSuggestions.useMutation({
    onSuccess: () => {
      setTimeout(() => {
        utils.parent.getLearningSuggestions.invalidate();
      }, 5000);
    },
  });

  if (!effectiveStudentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="text-2xl font-bold">{t("parent.suggestions.title")}</h1>
        <p className="mt-4 text-muted-foreground">
          {t("homework.selectStudent")}
        </p>
      </div>
    );
  }

  const latestSuggestion = suggestionsData?.suggestions?.[0];
  const suggestionContent = latestSuggestion?.content as {
    suggestions?: Array<{
      category: string;
      title: string;
      description: string;
      relatedKnowledgePoints: string[];
      priority: string;
    }>;
    attentionItems?: Array<{
      type: string;
      description: string;
      actionRequired: boolean;
    }>;
    parentActions?: Array<{
      action: string;
      reason: string;
      frequency: string;
    }>;
  } | null;

  const priorityColors: Record<string, string> = {
    high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  };

  const attentionColors: Record<string, string> = {
    regression_risk: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    foundational_gap: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    overload_warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  };

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("parent.suggestions.title")}</h1>
        <div className="flex items-center gap-2">
          {latestSuggestion && (
            <Badge variant="outline">
              {latestSuggestion.type === "WEEKLY_AUTO"
                ? t("parent.suggestions.weeklyAuto")
                : t("parent.suggestions.onDemand")}
              {" · "}
              {new Date(latestSuggestion.createdAt).toLocaleDateString()}
            </Badge>
          )}
          <Button
            size="sm"
            onClick={() =>
              requestMutation.mutate({ studentId: effectiveStudentId })
            }
            disabled={requestMutation.isPending}
          >
            {requestMutation.isPending
              ? t("parent.suggestions.refreshing")
              : t("parent.suggestions.refreshBtn")}
          </Button>
        </div>
      </div>

      {requestMutation.error && (
        <p className="text-sm text-destructive">
          {requestMutation.error.message.includes("cooldown")
            ? t("parent.suggestions.cooldownHint", { time: "1h" })
            : requestMutation.error.message}
        </p>
      )}

      {/* Empty State */}
      {!suggestionsLoading && !suggestionContent && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium">
              {t("parent.suggestions.emptyTitle")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("parent.suggestions.emptyDesc")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Suggestions Section */}
      {suggestionContent?.suggestions && suggestionContent.suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("parent.suggestions.suggestionsSection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestionContent.suggestions.map((s, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={priorityColors[s.priority] ?? ""}>
                        {t(`parent.suggestions.priority.${s.priority}` as any)}
                      </Badge>
                      <Badge variant="outline">
                        {t(`parent.suggestions.category.${s.category}` as any)}
                      </Badge>
                    </div>
                    <h4 className="font-medium">{s.title}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {s.description}
                    </p>
                    {s.relatedKnowledgePoints.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {s.relatedKnowledgePoints.map((kp, j) => (
                          <Badge key={j} variant="secondary" className="text-xs">
                            {kp}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Attention Items */}
      {suggestionContent?.attentionItems && suggestionContent.attentionItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("parent.suggestions.attentionSection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestionContent.attentionItems.map((item, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={attentionColors[item.type] ?? ""}>
                    {t(`parent.suggestions.attentionType.${item.type}` as any)}
                  </Badge>
                  {item.actionRequired && (
                    <Badge variant="destructive" className="text-xs">
                      {t("parent.suggestions.actionRequired")}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Parent Actions */}
      {suggestionContent?.parentActions && suggestionContent.parentActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("parent.suggestions.parentActionsSection")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {suggestionContent.parentActions.map((action, i) => (
              <div key={i} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-medium">{action.action}</h4>
                  <Badge variant="outline">
                    {t(`parent.suggestions.frequency.${action.frequency}` as any)}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">{action.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Intervention Effect */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t("parent.intervention.effectTitle")}</CardTitle>
            <div className="flex gap-1">
              {(["7d", "30d"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  onClick={() => setPeriod(p)}
                >
                  {t(`parent.stats.period.${p}` as any)}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {effectLoading ? (
            <p className="text-sm text-muted-foreground">...</p>
          ) : !effectData?.effects?.length ? (
            <p className="text-sm text-muted-foreground">
              {t("parent.intervention.emptyEffect")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left font-medium">{t("parent.intervention.kpColumn")}</th>
                    <th className="py-2 text-left font-medium">
                      {t("parent.intervention.preMastery")}
                    </th>
                    <th className="py-2 text-left font-medium">
                      {t("parent.intervention.postMastery")}
                    </th>
                    <th className="py-2 text-left font-medium">
                      {t("parent.intervention.delta")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {effectData.effects.map((e, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2">{e.kpName}</td>
                      <td className="py-2">
                        {e.preMastery ? (
                          <Badge variant="outline">
                            {t(`parent.intervention.masteryStatus.${e.preMastery}` as any)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {t("parent.intervention.noBaseline")}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <Badge variant="outline">
                          {t(`parent.intervention.masteryStatus.${e.postMastery}` as any)}
                        </Badge>
                      </td>
                      <td className="py-2">
                        <span
                          className={
                            e.delta > 0
                              ? "text-green-600"
                              : e.delta < 0
                                ? "text-red-600"
                                : "text-muted-foreground"
                          }
                        >
                          {e.delta > 0
                            ? `+${e.delta} ${t("parent.intervention.improved")}`
                            : e.delta < 0
                              ? `${e.delta} ${t("parent.intervention.declined")}`
                              : t("parent.intervention.unchanged")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intervention Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>{t("parent.intervention.timelineTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          {timelineLoading ? (
            <p className="text-sm text-muted-foreground">...</p>
          ) : !timelineData?.events?.length ? (
            <p className="text-sm text-muted-foreground">
              {t("parent.intervention.emptyTimeline")}
            </p>
          ) : (
            <div className="relative ml-3 border-l pl-6 space-y-4">
              {timelineData.events.map((event) => (
                <div key={event.id} className="relative">
                  <div className="absolute -left-[31px] top-1.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  <div className="flex items-center gap-2 text-sm">
                    <Badge variant="outline">
                      {t(`parent.intervention.type.${event.type}` as any)}
                    </Badge>
                    <span className="font-medium">{event.kpName}</span>
                    {event.status === "foundational" && (
                      <Badge variant="secondary" className="text-xs">
                        {t("parent.intervention.foundational")}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {new Date(event.timestamp).toLocaleDateString()}{" "}
                      {new Date(event.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {event.preMastery && (
                      <span>
                        {t(`parent.intervention.masteryStatus.${event.preMastery}` as any)}
                        {" → "}
                        {t(`parent.intervention.masteryStatus.${event.currentMastery}` as any)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
