"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/pro/glass-card";
import { GradientMesh } from "@/components/pro/gradient-mesh";

const GENERATION_TIMEOUT_MS = 90_000;

export default function ParentSuggestionsPage() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();
  const [period, setPeriod] = useState<"7d" | "30d">("7d");
  const [isPeriodPending, startPeriodTransition] = useTransition();

  const [isGenerating, setIsGenerating] = useState(false);
  const toastIdRef = useRef<string | number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: students } = trpc.family.students.useQuery();
  const effectiveStudentId = selectedStudentId || students?.[0]?.id || null;

  useEffect(() => {
    if (!selectedStudentId && students?.[0]?.id) {
      setSelectedStudentId(students[0].id);
    }
  }, [selectedStudentId, students, setSelectedStudentId]);

  const utils = trpc.useUtils();

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

  const clearGenerationWatchdog = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (toastIdRef.current !== null) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
  };

  const requestMutation = trpc.parent.requestLearningSuggestions.useMutation({
    onSuccess: () => {
      clearGenerationWatchdog();
      toastIdRef.current = toast.loading(t("parent.suggestions.generating"));
      setIsGenerating(true);
      // Fallback: if SSE never fires (worker crashed before publish), tell
      // the user we'll retry later rather than spinning forever.
      timeoutRef.current = setTimeout(() => {
        if (toastIdRef.current !== null) {
          toast.dismiss(toastIdRef.current);
          toastIdRef.current = null;
        }
        toast.warning(t("parent.suggestions.generateTimeout"));
        setIsGenerating(false);
        timeoutRef.current = null;
      }, GENERATION_TIMEOUT_MS);
    },
    onError: (err) => {
      if (err.message.includes("cooldown")) {
        toast.error(t("parent.suggestions.cooldownHint", { time: "1h" }));
      } else {
        toast.error(err.message);
      }
    },
  });

  trpc.subscription.onLearningSuggestionGenerated.useSubscription(
    { studentId: effectiveStudentId ?? "" },
    {
      enabled: !!effectiveStudentId && isGenerating,
      onData: (event) => {
        if (event.type !== "learning-suggestion") return;
        clearGenerationWatchdog();
        setIsGenerating(false);
        if (event.status === "completed") {
          toast.success(t("parent.suggestions.generated"));
          utils.parent.getLearningSuggestions.invalidate();
        } else {
          toast.error(event.error ?? t("error.serverError"));
        }
      },
    }
  );

  // Clean up timers/toasts if the component unmounts mid-generation
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (toastIdRef.current !== null) toast.dismiss(toastIdRef.current);
    };
  }, []);

  // Switching students mid-generation: the subscription re-binds to the new
  // student's channel, so the in-flight job's "completed" event would never
  // dismiss our loading toast. Cancel the watchdog so the user isn't left
  // staring at a toast that never ends.
  useEffect(() => {
    if (isGenerating) {
      clearGenerationWatchdog();
      setIsGenerating(false);
    }
    // Only react to student-id changes, not isGenerating flips.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveStudentId]);

  if (!effectiveStudentId) {
    return (
      <div className="relative max-w-4xl p-6">
        <GradientMesh className="absolute inset-0 -z-10 rounded-xl" />
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

  const refreshBusy = requestMutation.isPending || isGenerating;

  return (
    <div className="relative">
      <GradientMesh className="absolute inset-0 -z-10 rounded-xl" />
      <div className="relative max-w-5xl space-y-6 p-6">
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
              disabled={refreshBusy}
            >
              {refreshBusy && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isGenerating
                ? t("parent.suggestions.generating")
                : requestMutation.isPending
                  ? t("parent.suggestions.refreshing")
                  : t("parent.suggestions.refreshBtn")}
            </Button>
          </div>
        </div>

        {/* Empty State */}
        {!suggestionsLoading && !suggestionContent && (
          <GlassCard intensity="subtle" glow="none" className="p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <h3 className="text-lg font-medium">
                {t("parent.suggestions.emptyTitle")}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("parent.suggestions.emptyDesc")}
              </p>
            </div>
          </GlassCard>
        )}

        {/* Suggestions Section */}
        {suggestionContent?.suggestions && suggestionContent.suggestions.length > 0 && (
          <GlassCard intensity="subtle" className="p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {t("parent.suggestions.suggestionsSection")}
            </h2>
            <div className="space-y-3">
              {suggestionContent.suggestions.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className="rounded-lg border p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
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
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Attention Items */}
        {suggestionContent?.attentionItems && suggestionContent.attentionItems.length > 0 && (
          <GlassCard intensity="subtle" className="p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {t("parent.suggestions.attentionSection")}
            </h2>
            <div className="space-y-3">
              {suggestionContent.attentionItems.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className="rounded-lg border p-4"
                >
                  <div className="mb-1 flex items-center gap-2">
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
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Parent Actions */}
        {suggestionContent?.parentActions && suggestionContent.parentActions.length > 0 && (
          <GlassCard intensity="subtle" className="p-6">
            <h2 className="mb-4 text-lg font-semibold">
              {t("parent.suggestions.parentActionsSection")}
            </h2>
            <div className="space-y-3">
              {suggestionContent.parentActions.map((action, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className="rounded-lg border p-4"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <h4 className="font-medium">{action.action}</h4>
                    <Badge variant="outline">
                      {t(`parent.suggestions.frequency.${action.frequency}` as any)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{action.reason}</p>
                </motion.div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Intervention Effect */}
        <GlassCard intensity="subtle" className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {t("parent.intervention.effectTitle")}
            </h2>
            <div className="flex gap-1">
              {(["7d", "30d"] as const).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? "default" : "outline"}
                  onClick={() => startPeriodTransition(() => setPeriod(p))}
                  disabled={isPeriodPending && period !== p}
                >
                  {t(`parent.stats.period.${p}` as any)}
                </Button>
              ))}
            </div>
          </div>
          {effectLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : !effectData?.effects?.length ? (
            <p className="py-6 text-sm text-muted-foreground">
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
        </GlassCard>

        {/* Intervention Timeline */}
        <GlassCard intensity="subtle" className="p-6">
          <h2 className="mb-4 text-lg font-semibold">
            {t("parent.intervention.timelineTitle")}
          </h2>
          {timelineLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : !timelineData?.events?.length ? (
            <p className="py-6 text-sm text-muted-foreground">
              {t("parent.intervention.emptyTimeline")}
            </p>
          ) : (
            <div className="relative ml-3 space-y-4 border-l pl-6">
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
        </GlassCard>
      </div>
    </div>
  );
}
