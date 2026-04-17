"use client";

import { motion } from "framer-motion";
import { Sparkles, Brain, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { useTier } from "@/components/providers/grade-tier-provider";
import { cn } from "@/lib/utils";

type TaskType = "REVIEW" | "PRACTICE" | "EXPLANATION";

const TYPE_META: Record<
  TaskType,
  { icon: LucideIcon; hex: string; badgeClass: string; defaultBorder: string }
> = {
  REVIEW: {
    icon: RotateCw,
    hex: "#3b82f6",
    badgeClass: "bg-blue-100 text-blue-800",
    defaultBorder: "border-l-4 border-l-blue-500",
  },
  PRACTICE: {
    icon: Sparkles,
    hex: "#f97316",
    badgeClass: "bg-orange-100 text-orange-800",
    defaultBorder: "border-l-4 border-l-orange-500",
  },
  EXPLANATION: {
    icon: Brain,
    hex: "#10b981",
    badgeClass: "bg-green-100 text-green-800",
    defaultBorder: "border-l-4 border-l-green-500",
  },
};

interface TaskCardProps {
  task: {
    id: string;
    type: TaskType;
    status: "PENDING" | "COMPLETED";
    content: { title?: string; description?: string } | null;
    knowledgePoint: { id: string; name: string; subject: string };
    question: { id: string; content: string } | null;
  };
  /** REVIEW: directly mark complete. */
  onComplete: (taskId: string) => void;
  /** PRACTICE: open practice dialog. */
  onStartPractice: (taskId: string) => void;
  /** EXPLANATION: open explanation dialog. */
  onOpenExplanation: (taskId: string) => void;
  readOnly: boolean;
  completing: boolean;
}

export function TaskCard({
  task,
  onComplete,
  onStartPractice,
  onOpenExplanation,
  readOnly,
  completing,
}: TaskCardProps) {
  const t = useTierTranslations("tasks");
  const { tier } = useTier();
  const isCompleted = task.status === "COMPLETED";
  const meta = TYPE_META[task.type] ?? TYPE_META.REVIEW;
  const TypeIcon = meta.icon;

  function actionLabel() {
    if (task.type === "PRACTICE") return t("startPractice");
    if (task.type === "EXPLANATION") return t("viewExplanation");
    return t("markComplete");
  }

  function handleAction() {
    if (task.type === "PRACTICE") onStartPractice(task.id);
    else if (task.type === "EXPLANATION") onOpenExplanation(task.id);
    else onComplete(task.id);
  }

  // Wonder: chunky left rail + drop shadow (inline style for type color)
  // Cosmic: neon inset border + outer glow (inline style for type color)
  // Flow / studio: legacy thin colored left border (from meta.defaultBorder)
  const cardStyle =
    tier === "wonder"
      ? { boxShadow: `0 12px 32px -14px ${meta.hex}80` }
      : tier === "cosmic"
        ? {
            boxShadow: `inset 0 0 0 1px ${meta.hex}66, 0 0 20px -6px ${meta.hex}55`,
          }
        : undefined;

  const baseClass =
    tier === "wonder" || tier === "cosmic" ? undefined : meta.defaultBorder;

  return (
    <motion.div
      animate={
        isCompleted
          ? { scale: 0.98, opacity: 0.55 }
          : { scale: 1, opacity: 1 }
      }
      whileHover={!isCompleted && tier === "wonder" ? { y: -3 } : undefined}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <AdaptiveCard
        className={cn(baseClass, "relative overflow-hidden")}
        style={cardStyle}
      >
        {tier === "wonder" && (
          <div
            aria-hidden
            className="absolute left-0 top-0 bottom-0 w-2"
            style={{ backgroundColor: meta.hex }}
          />
        )}
        <CardContent
          className={cn(
            "py-4",
            tier === "wonder" && "pl-5"
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2 flex-wrap">
                <Badge
                  className={cn(
                    meta.badgeClass,
                    tier === "wonder" && "gap-1 text-sm"
                  )}
                  variant="outline"
                >
                  {(tier === "wonder" || tier === "cosmic") && (
                    <TypeIcon className="h-3.5 w-3.5" />
                  )}
                  {t(`types.${task.type}`)}
                </Badge>
                <AdaptiveSubjectBadge subject={task.knowledgePoint.subject}>
                  {task.knowledgePoint.subject}
                </AdaptiveSubjectBadge>
                {isCompleted && (
                  <Badge variant="secondary" className="gap-1">
                    <motion.svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                    >
                      <motion.path
                        d="M5 13l4 4L19 7"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </motion.svg>
                    {t("completed")}
                  </Badge>
                )}
              </div>
              <p
                className={cn(
                  "font-medium",
                  tier === "wonder" && "text-lg"
                )}
              >
                {task.knowledgePoint.name}
              </p>
              {task.type === "REVIEW" && task.question?.content && (
                <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                  {task.question.content}
                </p>
              )}
              {(task.type === "PRACTICE" || task.type === "EXPLANATION") &&
                task.content?.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                    {task.content.description}
                  </p>
                )}
              <p className="mt-1 text-xs text-muted-foreground">
                {t(`typeDescriptions.${task.type}`)}
              </p>
            </div>
            {!readOnly && !isCompleted && (
              <AdaptiveButton
                size="sm"
                variant={tier === "wonder" ? "default" : "outline"}
                onClick={handleAction}
                disabled={completing}
                className={cn(
                  tier === "wonder" &&
                    "shadow-md font-bold bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white border-0 hover:from-fuchsia-600 hover:to-violet-600"
                )}
              >
                {actionLabel()}
              </AdaptiveButton>
            )}
          </div>
        </CardContent>
      </AdaptiveCard>
    </motion.div>
  );
}
