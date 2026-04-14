"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Card, CardContent } from "@/components/ui/card";
import { TaskCard } from "@/components/tasks/task-card";

export default function TasksPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const { selectedStudentId } = useStudentStore();
  const [completingId, setCompletingId] = useState<string | null>(null);

  const isParent = role === "PARENT";
  const studentId = isParent ? selectedStudentId ?? undefined : undefined;

  const { data: pack, refetch } = trpc.dailyTask.todayTasks.useQuery(
    { studentId },
    { enabled: !!session },
  );

  const completeMutation = trpc.dailyTask.completeTask.useMutation({
    onSuccess: () => {
      setCompletingId(null);
      refetch();
    },
    onError: () => {
      setCompletingId(null);
    },
  });

  const handleComplete = (taskId: string) => {
    setCompletingId(taskId);
    completeMutation.mutate({ taskId });
  };

  if (isParent && !selectedStudentId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p>{t("homework.selectStudent")}</p>
      </div>
    );
  }

  // Progress
  const total = pack?.totalTasks ?? 0;
  const completed = pack?.completedTasks ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const allDone = pack?.status === "COMPLETED";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("tasks.title")}</h1>

      {/* Progress bar */}
      {pack && total > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("tasks.progress", { completed, total })}
              </span>
              <span className="font-medium">{pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* All completed celebration */}
      {allDone && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-6 text-center">
            <p className="text-lg font-semibold text-green-800">
              {t("tasks.allCompleted")}
            </p>
            <p className="text-sm text-green-600">
              {t("tasks.allCompletedSubtext")}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Task list */}
      {pack?.tasks && pack.tasks.length > 0 ? (
        <div className="space-y-3">
          {pack.tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={{
                id: task.id,
                type: task.type as "REVIEW" | "PRACTICE" | "EXPLANATION",
                status: task.status as "PENDING" | "COMPLETED",
                content: task.content as { title?: string; description?: string } | null,
                knowledgePoint: task.knowledgePoint,
                question: task.question,
              }}
              onComplete={handleComplete}
              readOnly={isParent}
              completing={completingId === task.id}
            />
          ))}
        </div>
      ) : (
        !allDone && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg text-muted-foreground">
                {t("tasks.empty")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("tasks.emptySubtext")}
              </p>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
