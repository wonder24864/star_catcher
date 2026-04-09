"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  X,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type CheckRound = {
  id: string;
  roundNumber: number;
  score: number | null;
  totalQuestions: number | null;
  correctCount: number | null;
  results: Array<{
    sessionQuestionId: string;
    isCorrect: boolean;
    correctedFromPrev: boolean;
  }>;
};

type Question = {
  id: string;
  questionNumber: number;
  content: string;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  needsReview: boolean;
  aiKnowledgePoint: string | null;
};

export default function CheckResultsPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.homework.getCheckStatus.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  const completeSession = trpc.homework.completeSession.useMutation({
    onSuccess: () => {
      utils.homework.getCheckStatus.invalidate({ sessionId });
      toast.success(t("homework.check.completedTitle"));
      setConfirmCompleteOpen(false);
    },
    onError: () => toast.error(t("error.serverError")),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!session) {
    router.push("/check");
    return null;
  }

  const sessionData = session as unknown as {
    status: string;
    finalScore: number | null;
    checkRounds: CheckRound[];
    questions: Question[];
  };

  const rounds = sessionData.checkRounds ?? [];
  const questions = sessionData.questions ?? [];
  const latestRound = rounds[rounds.length - 1] as CheckRound | undefined;
  const wrongCount = questions.filter((q) => q.isCorrect !== true).length;
  const isCompleted = sessionData.status === "COMPLETED";

  const handleCompleteClick = () => {
    if (wrongCount > 0) {
      setConfirmCompleteOpen(true);
    } else {
      completeSession.mutate({ sessionId });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/check")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {isCompleted
              ? t("homework.check.completedTitle")
              : t("homework.check.title")}
          </h1>
          {latestRound && (
            <p className="text-sm text-muted-foreground">
              {t("homework.check.scoreDisplay", {
                correct: latestRound.correctCount ?? 0,
                total: latestRound.totalQuestions ?? 0,
                score: latestRound.score ?? 0,
              })}
            </p>
          )}
        </div>
      </div>

      {/* Completed banner */}
      {isCompleted && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
            <p className="font-semibold text-green-700">
              {t("homework.check.finalScore", {
                score: sessionData.finalScore ?? 0,
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Score history (visible when >1 round) */}
      {rounds.length > 1 && (
        <Card>
          <CardContent className="py-3">
            <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
              <TrendingUp className="h-4 w-4" />
              {t("homework.check.scoreHistory")}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {rounds.map((r, i) => (
                <span key={r.id} className="flex items-center gap-1 text-sm">
                  {i > 0 && (
                    <span className="text-muted-foreground mx-1">→</span>
                  )}
                  <Badge
                    variant={i === rounds.length - 1 ? "default" : "secondary"}
                  >
                    {t("homework.check.round", { round: r.roundNumber })}{" "}
                    {r.score ?? 0}
                  </Badge>
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Question list — correct/incorrect only, NO correct answers */}
      <div className="space-y-2">
        {questions.map((q) => (
          <Card
            key={q.id}
            className={cn(
              "border-l-4",
              q.isCorrect === true ? "border-l-green-500" : "border-l-red-500"
            )}
          >
            <CardContent className="py-3">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div
                  className={cn(
                    "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5",
                    q.isCorrect === true ? "bg-green-100" : "bg-red-100"
                  )}
                >
                  {q.isCorrect === true ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <X className="h-4 w-4 text-red-600" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-muted-foreground">
                      #{q.questionNumber}
                    </span>
                    {q.aiKnowledgePoint && (
                      <Badge variant="secondary" className="text-xs">
                        {q.aiKnowledgePoint}
                      </Badge>
                    )}
                    {q.needsReview && (
                      <Badge
                        variant="outline"
                        className="text-xs text-amber-600 border-amber-300"
                      >
                        {t("homework.needsReview")}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm">{q.content}</p>
                  {q.studentAnswer && (
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        q.isCorrect === true
                          ? "text-green-600"
                          : "text-red-500"
                      )}
                    >
                      {t("homework.studentAnswer")}: {q.studentAnswer}
                    </p>
                  )}
                  {/* correctAnswer intentionally NOT shown per US-016 */}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bottom actions */}
      {!isCompleted ? (
        <div className="flex flex-col gap-3 pt-4 border-t">
          <p className="text-sm text-center text-muted-foreground">
            {wrongCount === 0
              ? t("homework.check.allCorrect")
              : t("homework.check.wrongCount", { count: wrongCount })}
          </p>
          {/* Re-check: Task 21 will enable this */}
          <Button
            variant="outline"
            size="lg"
            disabled
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {t("homework.check.recheck")}
          </Button>
          <Button
            size="lg"
            onClick={handleCompleteClick}
            disabled={completeSession.isPending}
          >
            {t("homework.check.complete")}
          </Button>
        </div>
      ) : (
        <div className="pt-4 border-t">
          <Button
            className="w-full"
            size="lg"
            onClick={() => router.push("/check")}
          >
            {t("homework.check.backToList")}
          </Button>
        </div>
      )}

      {/* Confirm-complete dialog */}
      <Dialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("homework.check.confirmCompleteTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("homework.check.confirmCompleteDesc", { count: wrongCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setConfirmCompleteOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => completeSession.mutate({ sessionId })}
              disabled={completeSession.isPending}
            >
              {t("homework.check.complete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
