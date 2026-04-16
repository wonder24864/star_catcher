"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { CardContent } from "@/components/ui/card";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveProgress } from "@/components/adaptive/adaptive-progress";
import { Celebration } from "@/components/animation/celebration";
import { useTier } from "@/components/providers/grade-tier-provider";
import { TaskCard } from "@/components/tasks/task-card";
import { PracticeDialog } from "@/components/tasks/practice-dialog";
import { ExplanationDialog } from "@/components/tasks/explanation-dialog";

export default function TasksPage() {
  const t = useTranslations();
  const tT = useTierTranslations("tasks");
  const { data: session } = useSession();
  const role = session?.user?.role;
  const { selectedStudentId } = useStudentStore();
  const { tierIndex } = useTier();
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [practiceTaskId, setPracticeTaskId] = useState<string | null>(null);
  const [explanationTaskId, setExplanationTaskId] = useState<string | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);

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

  // Trigger celebration once on allDone transition (not on every render)
  const prevAllDone = useRef(false);
  useEffect(() => {
    if (allDone && !prevAllDone.current) {
      setShowCelebration(true);
    }
    prevAllDone.current = !!allDone;
  }, [allDone]);

  // Layout class per tier
  const listClass =
    tierIndex === 1
      ? "space-y-4"              // wonder: single column, large gap
      : tierIndex === 2
        ? "grid grid-cols-2 gap-3" // cosmic: two-column grid
        : "space-y-2";              // flow/studio: compact

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t("tasks.title")}</h1>

      {/* Progress bar */}
      {pack && total > 0 && (
        <AdaptiveCard>
          <CardContent className="py-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {t("tasks.progress", { completed, total })}
              </span>
              <span className="font-medium">{pct}%</span>
            </div>
            <AdaptiveProgress value={pct} total={total} />
          </CardContent>
        </AdaptiveCard>
      )}

      {/* All completed celebration */}
      {allDone && (
        <AdaptiveCard className="border-green-200 bg-green-50 dark:bg-green-950/30">
          <CardContent className="py-6 text-center">
            <p className="text-lg font-semibold text-green-800 dark:text-green-200">
              {tT("allCompleted")}
            </p>
            <p className="text-sm text-green-600 dark:text-green-400">
              {tT("allCompletedSubtext")}
            </p>
          </CardContent>
        </AdaptiveCard>
      )}
      <Celebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

      {/* Task list with stagger entrance */}
      {pack?.tasks && pack.tasks.length > 0 ? (
        <div className={listClass}>
          {pack.tasks.map((task, index) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06, duration: 0.25, ease: "easeOut" }}
            >
              <TaskCard
                task={{
                  id: task.id,
                  type: task.type as "REVIEW" | "PRACTICE" | "EXPLANATION",
                  status: task.status as "PENDING" | "COMPLETED",
                  content: task.content as { title?: string; description?: string } | null,
                  knowledgePoint: task.knowledgePoint,
                  question: task.question,
                }}
                onComplete={handleComplete}
                onStartPractice={(id) => setPracticeTaskId(id)}
                onOpenExplanation={(id) => setExplanationTaskId(id)}
                readOnly={isParent}
                completing={completingId === task.id}
              />
            </motion.div>
          ))}
        </div>
      ) : (
        !allDone && (
          <AdaptiveCard>
            <CardContent className="py-12 text-center">
              <p className="text-lg text-muted-foreground">
                {tT("empty")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {tT("emptySubtext")}
              </p>
            </CardContent>
          </AdaptiveCard>
        )
      )}

      {/* Practice flow dialog */}
      <PracticeDialog
        taskId={practiceTaskId}
        onClose={() => setPracticeTaskId(null)}
        onCompleted={() => {
          setPracticeTaskId(null);
          refetch();
        }}
      />

      {/* Explanation dialog */}
      <ExplanationDialog
        taskId={explanationTaskId}
        onClose={() => setExplanationTaskId(null)}
        onCompleted={() => {
          setExplanationTaskId(null);
          refetch();
        }}
      />
    </div>
  );
}
