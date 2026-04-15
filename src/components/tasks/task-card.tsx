"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TYPE_STYLES: Record<string, { border: string; badge: string }> = {
  REVIEW: {
    border: "border-l-4 border-l-blue-500",
    badge: "bg-blue-100 text-blue-800",
  },
  PRACTICE: {
    border: "border-l-4 border-l-orange-500",
    badge: "bg-orange-100 text-orange-800",
  },
  EXPLANATION: {
    border: "border-l-4 border-l-green-500",
    badge: "bg-green-100 text-green-800",
  },
};

interface TaskCardProps {
  task: {
    id: string;
    type: "REVIEW" | "PRACTICE" | "EXPLANATION";
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
  const t = useTranslations("tasks");
  const isCompleted = task.status === "COMPLETED";
  const style = TYPE_STYLES[task.type] ?? TYPE_STYLES.REVIEW;

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

  return (
    <Card className={`${style.border} ${isCompleted ? "opacity-60" : ""}`}>
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <Badge className={style.badge} variant="outline">
                {t(`types.${task.type}`)}
              </Badge>
              {isCompleted && (
                <Badge variant="secondary">{t("completed")}</Badge>
              )}
            </div>
            <p className="font-medium">
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
            <Button
              size="sm"
              variant="outline"
              onClick={handleAction}
              disabled={completing}
            >
              {actionLabel()}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
