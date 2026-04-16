"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/ui/math-text";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { Celebration } from "@/components/animation/celebration";
import { useTier } from "@/components/providers/grade-tier-provider";

interface PracticeDialogProps {
  taskId: string | null;
  onClose: () => void;
  onCompleted: () => void;
}

type Phase = "loading" | "answering" | "graded";

export function PracticeDialog({
  taskId,
  onClose,
  onCompleted,
}: PracticeDialogProps) {
  const t = useTierTranslations("tasks.practice");
  const { tierIndex } = useTier();
  const isWonder = tierIndex === 1;

  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [result, setResult] = useState<{
    correct: boolean;
    needsReview: boolean;
    correctAnswer: string | null;
  } | null>(null);

  // Use a mutation (not query) — startTask has side effects on EXPLANATION;
  // for PRACTICE it's idempotent but mutation gives us imperative control.
  const startMutation = trpc.dailyTask.startTask.useMutation({
    onSuccess: () => setPhase("answering"),
  });
  const startMutate = startMutation.mutate;

  const submitMutation = trpc.dailyTask.submitPracticeAnswer.useMutation({
    onSuccess: (data) => {
      setResult({
        correct: data.correct,
        needsReview: data.needsReview,
        correctAnswer: data.correctAnswer,
      });
      setPhase("graded");
      if (data.correct) setShowCelebration(true);
    },
  });

  // Trigger startTask exactly once per open. `mutate` is stable across
  // renders (react-query wraps it in useCallback), so depending on it is
  // safe and satisfies the exhaustive-deps rule.
  useEffect(() => {
    if (!taskId) return;
    startMutate({ taskId });
  }, [taskId, startMutate]);

  const data = startMutation.data;
  const similar =
    data && "similarQuestions" in data ? data.similarQuestions ?? [] : [];
  const original = data?.originalQuestion;

  function reset() {
    setPhase("loading");
    setSelectedId(null);
    setStudentAnswer("");
    setResult(null);
    setShowCelebration(false);
    startMutation.reset();
    submitMutation.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleDone() {
    reset();
    onCompleted();
  }

  function handleSubmit() {
    if (!taskId || !selectedId || !studentAnswer.trim()) return;
    submitMutation.mutate({
      taskId,
      selectedQuestionId: selectedId,
      studentAnswer: studentAnswer.trim(),
    });
  }

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

        {(startMutation.isPending || phase === "loading") && (
          <p className="py-8 text-center text-muted-foreground">{t("loading")}</p>
        )}

        {startMutation.isError && (
          <p className="py-8 text-center text-destructive">{t("loadError")}</p>
        )}

        {phase === "answering" && data && (
          <div className="space-y-4">
            {original && (
              <AdaptiveCard className="border-l-4 border-l-orange-300 bg-orange-50/40">
                <CardContent className="py-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    {t("originalLabel")}
                  </p>
                  <MathText text={original.content} className="text-sm" />
                </CardContent>
              </AdaptiveCard>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">{t("pickSimilar")}</p>
              {similar.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("noSimilar")}</p>
              ) : (
                <div className="space-y-2">
                  {similar.map((q) => (
                    <label
                      key={q.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-muted ${
                        selectedId === q.id
                          ? "border-primary bg-primary/5"
                          : "border-border"
                      }`}
                    >
                      <input
                        type="radio"
                        name="similar"
                        className="mt-1"
                        checked={selectedId === q.id}
                        onChange={() => setSelectedId(q.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <MathText text={q.content} className="text-sm" />
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          {t(`source.${q.source}`)}
                          {q.similarity !== undefined &&
                            ` · ${(q.similarity * 100).toFixed(0)}%`}
                        </Badge>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {selectedId && (
              <div>
                <p className="mb-2 text-sm font-semibold">{t("yourAnswerLabel")}</p>
                <Textarea
                  value={studentAnswer}
                  onChange={(e) => setStudentAnswer(e.target.value)}
                  placeholder={t("answerPlaceholder")}
                  rows={isWonder ? 4 : 3}
                  className={isWonder ? "min-h-[120px] text-lg" : ""}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <AdaptiveButton variant="outline" onClick={handleClose}>
                {t("cancel")}
              </AdaptiveButton>
              <AdaptiveButton
                onClick={handleSubmit}
                disabled={
                  !selectedId ||
                  !studentAnswer.trim() ||
                  submitMutation.isPending
                }
              >
                {submitMutation.isPending ? t("submitting") : t("submit")}
              </AdaptiveButton>
            </div>
          </div>
        )}

        {phase === "graded" && result && (
          <div className="space-y-4">
            <Celebration
              show={showCelebration}
              onComplete={() => setShowCelebration(false)}
            />

            <AdaptiveCard
              className={
                result.correct
                  ? "border-green-300 bg-green-50"
                  : "border-orange-300 bg-orange-50"
              }
            >
              <CardContent className="py-4">
                <p
                  className={`text-lg font-semibold ${
                    result.correct ? "text-green-800" : "text-orange-800"
                  }`}
                >
                  {result.correct ? t("correctTitle") : t("incorrectTitle")}
                </p>
                {!result.correct && result.correctAnswer && (
                  <p className="mt-2 text-sm">
                    <span className="font-medium">{t("correctAnswerLabel")}: </span>
                    <MathText text={result.correctAnswer} />
                  </p>
                )}
                {result.needsReview && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("aiUnavailable")}
                  </p>
                )}
              </CardContent>
            </AdaptiveCard>

            <div className="flex justify-end">
              <AdaptiveButton onClick={handleDone}>{t("done")}</AdaptiveButton>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
