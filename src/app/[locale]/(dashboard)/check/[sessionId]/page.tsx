"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  X,
  AlertTriangle,
  Plus,
  Trash2,
  ChevronRight,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
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
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveScore } from "@/components/adaptive/adaptive-score";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { RecognitionOverlay } from "@/components/homework/recognition-overlay";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";
import { QuestionImage } from "@/components/homework/question-image";

export default function RecognitionResultsPage() {
  const t = useTranslations();
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: authSession } = useSession();
  // Students should NOT see the AI-extracted correct answer on the review
  // page — they should fix their own answer and then ask for help on the
  // /results page. Parents/admins see it so they can verify OCR accuracy.
  const canSeeCorrectAnswer = authSession?.user?.role !== "STUDENT";

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

  // AI is processing — full-screen tier-adaptive overlay.
  // When arriving from /check/new the cache is pre-warmed with status=RECOGNIZING
  // (optimistic update in the mutation), so this path matches without a flicker.
  if (session.status === "RECOGNIZING") {
    return <RecognitionOverlay open={true} />;
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
    imageRegion: { x: number; y: number; w: number; h: number } | null;
  }> ?? [];

  const sessionImages = (session as { images?: Array<{ id: string }> }).images ?? [];

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
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>
                {t("homework.correctCount", { correct: correctCount, total: questions.length })}
              </span>
              <span>·</span>
              <AdaptiveScore value={totalScore} total={100} />
            </div>
          </div>
        </div>
        <Badge variant="secondary">
          {t(`homework.status.${session.status}`)}
        </Badge>
      </div>

      {/* Student-facing tip: help is available on the next page after
          confirming the OCR result. Keeps the review page focused on
          verifying AI accuracy while signposting where hints live. */}
      {!canSeeCorrectAnswer && questions.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <Lightbulb className="h-4 w-4 mt-0.5 shrink-0" />
          <p>{t("homework.reviewStudentTip")}</p>
        </div>
      )}

      {/* Questions list */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>{t("homework.noQuestions")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q, index) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04, duration: 0.25, ease: "easeOut" }}
            >
              <AdaptiveCard
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
                          <AdaptiveSubjectBadge subject="MATH">
                            {q.aiKnowledgePoint}
                          </AdaptiveSubjectBadge>
                        )}
                      </div>
                      {/* OCR-detected image region (figure/diagram attached to
                         the question). Only render when the session has a
                         single source image — the OCR schema doesn't tag
                         which image each region came from, so in multi-image
                         sessions we'd crop the wrong source. Mirrors the
                         gating used on /results. */}
                      {q.imageRegion && sessionImages.length === 1 && sessionImages[0] && (
                        <QuestionImage
                          imageId={sessionImages[0].id}
                          region={q.imageRegion}
                          alt={t("homework.questionFigureAlt", { number: q.questionNumber })}
                          className="mt-1 max-w-xs"
                        />
                      )}
                      <p className="mt-1 text-sm"><MathText text={q.content} /></p>
                    </div>

                    {/* Correct/Incorrect toggle.
                        When inactive the shadcn `outline` variant defaults to
                        `bg-background` — that's DARK indigo in cosmic, which
                        rendered as a black hole inside the white `bg-card`
                        wrapper and swallowed the icon. Override with
                        `bg-card text-card-foreground border-card-foreground/30`
                        so the inactive state matches the card color scope
                        across every tier (user feedback 2026-04-17). */}
                    <div className="flex items-center gap-1 ml-3">
                      <Button
                        variant={q.isCorrect === false ? "destructive" : "outline"}
                        size="icon"
                        className={cn(
                          "h-9 w-9",
                          q.isCorrect !== false &&
                            "bg-card text-card-foreground border-card-foreground/30 hover:bg-muted dark:bg-card dark:hover:bg-muted",
                        )}
                        onClick={() => handleToggleCorrect(q.id, q.isCorrect)}
                        aria-label={t("homework.markIncorrect")}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={q.isCorrect === true ? "default" : "outline"}
                        size="icon"
                        className={cn(
                          "h-9 w-9",
                          q.isCorrect === true && "bg-green-600 text-white hover:bg-green-700",
                          q.isCorrect !== true &&
                            "bg-card text-card-foreground border-card-foreground/30 hover:bg-muted dark:bg-card dark:hover:bg-muted",
                        )}
                        onClick={() => handleToggleCorrect(q.id, q.isCorrect)}
                        aria-label={t("homework.markCorrect")}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Answer display. Students only see their own answer —
                      the AI-extracted "correct answer" is hidden so they can
                      self-reflect before requesting help on /results. */}
                  <div
                    className={cn(
                      "grid gap-2 text-sm",
                      canSeeCorrectAnswer ? "grid-cols-2" : "grid-cols-1",
                    )}
                  >
                    <div>
                      <span className="text-muted-foreground">{t("homework.studentAnswer")}:</span>{" "}
                      <span className={cn(q.isCorrect === false && "text-red-600 font-medium")}>
                        {q.studentAnswer ? <MathText text={q.studentAnswer} /> : "—"}
                      </span>
                    </div>
                    {canSeeCorrectAnswer && (
                      <div>
                        <span className="text-muted-foreground">{t("homework.correctAnswer")}:</span>{" "}
                        <span>{q.correctAnswer ? <MathText text={q.correctAnswer} /> : "—"}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end">
                    <AdaptiveButton
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => deleteQuestion.mutate({ questionId: q.id })}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      {t("common.delete")}
                    </AdaptiveButton>
                  </div>
                </CardContent>
              </AdaptiveCard>
            </motion.div>
          ))}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center gap-3 pt-4 border-t">
        {/* Add question dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogTrigger asChild>
            <AdaptiveButton variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              {t("homework.addQuestion")}
            </AdaptiveButton>
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
              <AdaptiveButton onClick={handleAddQuestion} disabled={!newQuestion.content.trim()}>
                {t("common.confirm")}
              </AdaptiveButton>
            </div>
          </DialogContent>
        </Dialog>

        {/* Confirm results */}
        {session.status === "RECOGNIZED" && (
          <AdaptiveButton
            className="flex-1"
            size="lg"
            onClick={() => confirmResults.mutate({ sessionId })}
            disabled={confirmResults.isPending || questions.length === 0}
          >
            {t("homework.confirmResults")}
            <ChevronRight className="h-4 w-4 ml-2" />
          </AdaptiveButton>
        )}
      </div>
    </div>
  );
}
