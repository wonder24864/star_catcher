"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/ui/math-text";

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
  const t = useTranslations("tasks.practice");

  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [studentAnswer, setStudentAnswer] = useState("");
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
              <Card className="border-l-4 border-l-orange-300 bg-orange-50/40">
                <CardContent className="py-3">
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">
                    {t("originalLabel")}
                  </p>
                  <MathText text={original.content} className="text-sm" />
                </CardContent>
              </Card>
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
                  rows={3}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleClose}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !selectedId ||
                  !studentAnswer.trim() ||
                  submitMutation.isPending
                }
              >
                {submitMutation.isPending ? t("submitting") : t("submit")}
              </Button>
            </div>
          </div>
        )}

        {phase === "graded" && result && (
          <div className="space-y-4">
            <Card
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
            </Card>

            <div className="flex justify-end">
              <Button onClick={handleDone}>{t("done")}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
