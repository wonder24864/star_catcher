"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

export default function RecognitionResultsPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState({
    content: "",
    studentAnswer: "",
    correctAnswer: "",
  });

  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.homework.getSession.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  // SSE subscription: listen for async job completion (OCR recognition)
  trpc.subscription.onSessionJobComplete.useSubscription(
    { sessionId },
    {
      enabled: session?.status === "RECOGNIZING",
      onData: (event) => {
        if (event.type === "ocr-recognize") {
          utils.homework.getSession.invalidate({ sessionId });
          if (event.status === "failed") {
            toast.error(t("homework.recognitionFailed"));
          }
        }
      },
    }
  );

  const updateQuestion = trpc.homework.updateQuestion.useMutation({
    onSuccess: () => utils.homework.getSession.invalidate({ sessionId }),
    onError: () => toast.error(t("error.serverError")),
  });

  const deleteQuestion = trpc.homework.deleteQuestion.useMutation({
    onSuccess: () => utils.homework.getSession.invalidate({ sessionId }),
    onError: () => toast.error(t("error.serverError")),
  });

  const addQuestion = trpc.homework.addQuestion.useMutation({
    onSuccess: () => {
      utils.homework.getSession.invalidate({ sessionId });
      setAddDialogOpen(false);
      setNewQuestion({ content: "", studentAnswer: "", correctAnswer: "" });
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const confirmResults = trpc.homework.confirmResults.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      router.push(`/check/${sessionId}/results`);
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

  // Show recognizing spinner when AI is processing
  if (session.status === "RECOGNIZING") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
        <p className="text-muted-foreground">{t("homework.recognizing")}</p>
      </div>
    );
  }

  const questions = (session as Record<string, unknown>).questions as Array<{
    id: string;
    questionNumber: number;
    questionType: string | null;
    content: string;
    studentAnswer: string | null;
    correctAnswer: string | null;
    isCorrect: boolean | null;
    confidence: number | null;
    needsReview: boolean;
    aiKnowledgePoint: string | null;
  }> ?? [];

  const correctCount = questions.filter((q) => q.isCorrect === true).length;
  const totalScore = questions.length > 0
    ? Math.round((correctCount / questions.length) * 100)
    : 0;

  const handleToggleCorrect = (questionId: string, currentIsCorrect: boolean | null) => {
    const newValue = currentIsCorrect === true ? false : true;
    updateQuestion.mutate({ questionId, isCorrect: newValue });
  };

  const handleAddQuestion = () => {
    if (!newQuestion.content.trim()) return;
    addQuestion.mutate({
      sessionId,
      content: newQuestion.content,
      studentAnswer: newQuestion.studentAnswer || null,
      correctAnswer: newQuestion.correctAnswer || null,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/check")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{t("homework.recognitionResults")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("homework.correctCount", { correct: correctCount, total: questions.length })}
              {" · "}
              {t("homework.score", { score: totalScore })}
            </p>
          </div>
        </div>
        <Badge variant="secondary">
          {t(`homework.status.${session.status}`)}
        </Badge>
      </div>

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>{t("homework.noQuestions")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Card
              key={q.id}
              className={cn(
                "border-l-4",
                q.isCorrect === true && "border-l-green-500",
                q.isCorrect === false && "border-l-red-500",
                q.isCorrect === null && "border-l-gray-300"
              )}
            >
              <CardContent className="py-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        #{q.questionNumber}
                      </span>
                      {q.needsReview && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {t("homework.needsReview")}
                        </Badge>
                      )}
                      {q.aiKnowledgePoint && (
                        <Badge variant="secondary" className="text-xs">
                          {q.aiKnowledgePoint}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm"><MathText text={q.content} /></p>
                  </div>

                  {/* Correct/Incorrect toggle */}
                  <div className="flex items-center gap-1 ml-3">
                    <Button
                      variant={q.isCorrect === false ? "destructive" : "outline"}
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => handleToggleCorrect(q.id, q.isCorrect)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <Button
                      variant={q.isCorrect === true ? "default" : "outline"}
                      size="icon"
                      className={cn("h-9 w-9", q.isCorrect === true && "bg-green-600 hover:bg-green-700")}
                      onClick={() => handleToggleCorrect(q.id, q.isCorrect)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Answer display */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{t("homework.studentAnswer")}:</span>{" "}
                    <span className={cn(q.isCorrect === false && "text-red-600 font-medium")}>
                      {q.studentAnswer ? <MathText text={q.studentAnswer} /> : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t("homework.correctAnswer")}:</span>{" "}
                    <span>{q.correctAnswer ? <MathText text={q.correctAnswer} /> : "—"}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => deleteQuestion.mutate({ questionId: q.id })}
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    {t("common.delete")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        {/* Add question dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              {t("homework.addQuestion")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("homework.addQuestion")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t("homework.questionContent")}</Label>
                <Input
                  value={newQuestion.content}
                  onChange={(e) =>
                    setNewQuestion((p) => ({ ...p, content: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>{t("homework.studentAnswer")}</Label>
                <Input
                  value={newQuestion.studentAnswer}
                  onChange={(e) =>
                    setNewQuestion((p) => ({ ...p, studentAnswer: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label>{t("homework.correctAnswer")}</Label>
                <Input
                  value={newQuestion.correctAnswer}
                  onChange={(e) =>
                    setNewQuestion((p) => ({ ...p, correctAnswer: e.target.value }))
                  }
                />
              </div>
              <Button onClick={handleAddQuestion} disabled={!newQuestion.content.trim()}>
                {t("common.confirm")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm results */}
        {session.status === "RECOGNIZED" && (
          <Button
            className="flex-1"
            size="lg"
            onClick={() => confirmResults.mutate({ sessionId })}
            disabled={confirmResults.isPending || questions.length === 0}
          >
            {t("homework.confirmResults")}
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}
