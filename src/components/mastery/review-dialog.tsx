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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ReviewDialogProps {
  knowledgePointId: string | null;
  onClose: () => void;
}

type ReviewPhase = "material" | "assess" | "result";

export function ReviewDialog({ knowledgePointId, onClose }: ReviewDialogProps) {
  const t = useTranslations("mastery.review");
  const utils = trpc.useUtils();

  const [phase, setPhase] = useState<ReviewPhase>("material");
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [difficulty, setDifficulty] = useState<number>(3);

  const { data: reviewData, isLoading } = trpc.mastery.reviewDetail.useQuery(
    { knowledgePointId: knowledgePointId ?? "" },
    { enabled: !!knowledgePointId },
  );

  const submitMutation = trpc.mastery.submitReview.useMutation({
    onSuccess: () => {
      setPhase("result");
      // Invalidate mastery queries to refresh data
      void utils.mastery.list.invalidate();
      void utils.mastery.stats.invalidate();
      void utils.mastery.todayReviews.invalidate();
    },
  });

  const handleSubmit = () => {
    if (!knowledgePointId || isCorrect === null) return;
    submitMutation.mutate({
      knowledgePointId,
      isCorrect,
      selfRatedDifficulty: difficulty,
    });
  };

  const handleClose = () => {
    setPhase("material");
    setIsCorrect(null);
    setDifficulty(3);
    onClose();
  };

  const resultTransition = submitMutation.data?.transition;
  const isMastered = resultTransition?.includes("MASTERED");
  const isRegressed = resultTransition?.includes("REGRESSED");

  return (
    <Dialog open={!!knowledgePointId} onOpenChange={() => handleClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          {reviewData && (
            <p className="text-sm text-muted-foreground">
              {reviewData.knowledgePoint.name}
              <Badge variant="outline" className="ml-2">
                {reviewData.knowledgePoint.subject}
              </Badge>
            </p>
          )}
        </DialogHeader>

        {isLoading && (
          <div className="py-8 text-center text-muted-foreground">...</div>
        )}

        {/* Phase 1: Review Material */}
        {phase === "material" && reviewData && (
          <div className="space-y-4">
            <h3 className="font-medium">{t("material")}</h3>
            {reviewData.errorQuestions.length > 0 ? (
              <div className="space-y-3">
                {reviewData.errorQuestions.map((eq) => (
                  <Card key={eq.id}>
                    <CardContent className="py-3 text-sm">
                      <p className="font-medium">{eq.content}</p>
                      {eq.correctAnswer && (
                        <p className="mt-1 text-green-600">
                          {eq.correctAnswer}
                        </p>
                      )}
                      {eq.studentAnswer && (
                        <p className="mt-1 text-red-500 line-through">
                          {eq.studentAnswer}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {reviewData.knowledgePoint.description ??
                  reviewData.knowledgePoint.name}
              </p>
            )}
            <Button className="w-full" onClick={() => setPhase("assess")}>
              {t("selfAssess")}
            </Button>
          </div>
        )}

        {/* Phase 2: Self Assessment */}
        {phase === "assess" && (
          <div className="space-y-6">
            {/* Correct/Incorrect */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("selfAssess")}</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={isCorrect === true ? "default" : "outline"}
                  onClick={() => setIsCorrect(true)}
                  className="h-12"
                >
                  {t("correct")}
                </Button>
                <Button
                  variant={isCorrect === false ? "destructive" : "outline"}
                  onClick={() => setIsCorrect(false)}
                  className="h-12"
                >
                  {t("incorrect")}
                </Button>
              </div>
            </div>

            {/* Difficulty Rating */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{t("difficulty")}</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Button
                    key={n}
                    variant={difficulty === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setDifficulty(n)}
                    className="flex-1"
                  >
                    {t(`difficultyLabels.${n}` as `difficultyLabels.${1 | 2 | 3 | 4 | 5}`)}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              className="w-full"
              disabled={isCorrect === null || submitMutation.isPending}
              onClick={handleSubmit}
            >
              {submitMutation.isPending ? t("submitting") : t("submit")}
            </Button>
          </div>
        )}

        {/* Phase 3: Result */}
        {phase === "result" && submitMutation.data && (
          <div className="space-y-4 py-4 text-center">
            {isMastered && (
              <div>
                <p className="text-2xl">&#9733;</p>
                <p className="mt-2 font-medium text-green-600">
                  {t("resultMastered")}
                </p>
              </div>
            )}
            {isRegressed && (
              <p className="font-medium text-orange-600">
                {t("resultRegressed")}
              </p>
            )}
            {!isMastered && !isRegressed && (
              <p className="font-medium text-blue-600">
                {t("resultReviewing", {
                  date: new Date(
                    submitMutation.data.nextReviewAt,
                  ).toLocaleDateString(),
                })}
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={handleClose}>
              {t("close")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
