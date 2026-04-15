"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExplanationCard } from "@/components/tasks/explanation-card";

interface ExplanationDialogProps {
  taskId: string | null;
  onClose: () => void;
  onCompleted: () => void;
}

export function ExplanationDialog({
  taskId,
  onClose,
  onCompleted,
}: ExplanationDialogProps) {
  const t = useTranslations("tasks.explanation");
  const [completing, setCompleting] = useState(false);

  const startMutation = trpc.dailyTask.startTask.useMutation();
  const completeMutation = trpc.dailyTask.completeTask.useMutation({
    onSuccess: () => {
      setCompleting(false);
      reset();
      onCompleted();
    },
    onError: () => setCompleting(false),
  });

  // Trigger startTask once on first open
  if (taskId && !startMutation.isPending && !startMutation.data && !startMutation.isError) {
    startMutation.mutate({ taskId });
  }

  function reset() {
    startMutation.reset();
    completeMutation.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleDone() {
    if (!taskId) return;
    setCompleting(true);
    completeMutation.mutate({ taskId });
  }

  const data = startMutation.data;
  const card = data && "explanationCard" in data ? data.explanationCard : null;

  return (
    <Dialog
      open={!!taskId}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        {(startMutation.isPending || (!card && !startMutation.isError)) && (
          <p className="py-8 text-center text-muted-foreground">{t("generating")}</p>
        )}

        {startMutation.isError && (
          <p className="py-8 text-center text-destructive">
            {t("loadError")}
          </p>
        )}

        {card && (
          <ExplanationCard
            card={card}
            onComplete={handleDone}
            completing={completing}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
