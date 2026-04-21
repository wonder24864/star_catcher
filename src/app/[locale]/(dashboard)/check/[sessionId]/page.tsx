"use client";

/**
 * Homework Check — Canvas page.
 *
 * Sprint 17 rewrite: replaces the old list-based recognition review page
 * AND the /results page. The whole core+correction+completion flow now
 * lives here, with the UX centered on the original photo + tappable
 * question boxes (inspired by Bytedance's homework correction app).
 *
 * States handled:
 *   - RECOGNIZING  → full-screen RecognitionOverlay (AI is working)
 *   - RECOGNIZED   → canvas is editable; "完成核对" creates round 1
 *   - CHECKING     → canvas is editable; upload corrections / or finalize if all-correct
 *   - COMPLETED    → canvas is read-only; history drawer is visible
 *   - RECOGNITION_FAILED → redirect back to /check
 *
 * Role differences:
 *   - STUDENT does not see the AI-extracted correct answer in the sheet
 *     (US-016); PARENT/ADMIN does. Toggle / help / upload correction all
 *     stay available for the owner as before.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Camera,
  Loader2,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveScore } from "@/components/adaptive/adaptive-score";
import { RecognitionOverlay } from "@/components/homework/recognition-overlay";
import { Celebration } from "@/components/animation/celebration";
import { HomeworkCanvas } from "@/components/homework/homework-canvas";
import {
  QuestionDetailSheet,
  type DetailSheetQuestion,
} from "@/components/homework/question-detail-sheet";
import {
  ImageTabSwitcher,
  type ImageTabStats,
} from "@/components/homework/image-tab-switcher";
import { RoundHistoryDrawer } from "@/components/homework/round-history-drawer";
import { PhotoCapture } from "@/components/homework/photo-capture";
import { useUpload } from "@/hooks/use-upload";
import { useStartTask, useTaskLock } from "@/hooks/use-task";
import { MAX_IMAGES_PER_SESSION } from "@/lib/domain/validations/upload";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { useTierTranslations } from "@/hooks/use-tier-translations";

type SessionImage = { id: string; sortOrder: number };
// Minimal shape the page uses — intentionally narrower than Prisma's
// SessionQuestion. `confidence` is read server-side (sets needsReview at OCR
// time) but the UI doesn't need it directly, so it's omitted here.
type Question = {
  id: string;
  questionNumber: number;
  content: string;
  studentAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  needsReview: boolean;
  aiKnowledgePoint: string | null;
  homeworkImageId: string | null;
  imageRegion: { x: number; y: number; w: number; h: number } | null;
};
type CheckRound = {
  id: string;
  roundNumber: number;
  score: number | null;
  totalQuestions: number | null;
  correctCount: number | null;
};

export default function HomeworkCheckCanvasPage() {
  const t = useTranslations();
  const tC = useTierTranslations("homework");
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: authSession } = useSession();
  const canSeeCorrectAnswer = authSession?.user?.role !== "STUDENT";

  // selectedImageId is nullable; activeImage is always derived below with
  // images[0] as fallback, so no effect is needed to pick a default.
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [openQuestionId, setOpenQuestionId] = useState<string | null>(null);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [correctionImageIds, setCorrectionImageIds] = useState<string[]>([]);
  const [isUploadingCorrection, setIsUploadingCorrection] = useState(false);
  const [pendingCorrection, setPendingCorrection] = useState(false);
  // Track outstanding upload promises so the submit button stays disabled
  // while work is in flight. Each uploadFile call appends a resolver here.
  const uploadResolversRef = useRef<Array<() => void>>([]);

  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.homework.getSession.useQuery(
    { sessionId },
    { enabled: !!sessionId },
  );

  // Narrowed view-model for the page. The tRPC return type is the full
  // Prisma row shape + computed isOwner; this alias captures only the fields
  // the canvas reads so the rest of the component stays Prisma-import-free.
  const sessionData = session as unknown as
    | {
        status: string;
        finalScore: number | null;
        images: SessionImage[];
        questions: Question[];
        checkRounds: CheckRound[];
        isOwner: boolean;
      }
    | undefined;

  // SSE — OCR / correction-photos / finalize all land here. One subscription
  // covers both since the event schema discriminates on `type`.
  trpc.subscription.onSessionJobComplete.useSubscription(
    { sessionId },
    {
      enabled: !!session,
      onData: (event) => {
        if (event.type === "ocr-recognize") {
          utils.homework.getSession.invalidate({ sessionId });
          if (event.status === "failed") {
            toast.error(t("homework.recognitionFailed"));
          }
        } else if (event.type === "correction-photos") {
          setPendingCorrection(false);
          utils.homework.getSession.invalidate({ sessionId });
          if (event.status === "completed") {
            toast.success(t("homework.markup.recheckSuccess"));
          } else {
            toast.error(t("error.serverError"));
          }
          setCorrectionDialogOpen(false);
          setCorrectionImageIds([]);
        }
      },
    },
  );

  const updateQuestion = trpc.homework.updateQuestion.useMutation({
    onMutate: async (vars) => {
      // Optimistic — flip the cached isCorrect locally so the badge changes
      // instantly. Server may override on error; we invalidate in onSettled.
      await utils.homework.getSession.cancel({ sessionId });
      const prev = utils.homework.getSession.getData({ sessionId });
      if (prev) {
        const prevShape = prev as unknown as { questions: Question[] };
        utils.homework.getSession.setData({ sessionId }, {
          ...prev,
          questions: prevShape.questions.map((q) =>
            q.id === vars.questionId ? { ...q, isCorrect: vars.isCorrect ?? q.isCorrect } : q,
          ),
        } as unknown as typeof prev);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.homework.getSession.setData({ sessionId }, ctx.prev);
      toast.error(t("error.serverError"));
    },
    onSettled: () => utils.homework.getSession.invalidate({ sessionId }),
  });

  const deleteQuestion = trpc.homework.deleteQuestion.useMutation({
    onSuccess: () => {
      utils.homework.getSession.invalidate({ sessionId });
      setOpenQuestionId(null);
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const finalizeCheck = trpc.homework.finalizeCheck.useMutation({
    onSuccess: (result) => {
      utils.homework.getSession.invalidate({ sessionId });
      if (result.status === "COMPLETED") {
        toast.success(t("homework.check.completedTitle"));
        setShowCelebration(true);
      } else {
        // NEEDS_CORRECTIONS — toast and keep the user on the canvas.
        toast.info(
          t("homework.markup.needsCorrections", { count: result.wrongCount }),
        );
      }
      setConfirmCompleteOpen(false);
    },
    onError: (err) => {
      if (err.message === "NO_QUESTIONS_TO_FINALIZE") {
        toast.error(t("homework.noQuestions"));
      } else {
        toast.error(t("error.serverError"));
      }
    },
  });

  const submitCorrectionPhotosMutation =
    trpc.homework.submitCorrectionPhotos.useMutation({
      onSuccess: () => setPendingCorrection(true),
      onError: (err) => {
        if (err.message === "DATA_CONFLICT") {
          toast.error(t("error.dataConflict"));
        } else {
          toast.error(t("error.serverError"));
        }
      },
    });

  const { start: startCorrection } = useStartTask({
    type: "CORRECTION",
    buildKey: (input: { sessionId: string; imageIds: string[] }) =>
      `correction:${input.sessionId}`,
    mutation: submitCorrectionPhotosMutation,
  });
  const correctionLock = useTaskLock(`correction:${sessionId}`);
  const submittingCorrection =
    submitCorrectionPhotosMutation.isPending || correctionLock.locked;

  const { upload: uploadFile, uploadProgress: correctionUploadProgress, reset: resetUpload } =
    useUpload({
      sessionId,
      onSuccess: (image) => {
        setCorrectionImageIds((prev) => [...prev, image.id]);
        uploadResolversRef.current.shift()?.();
      },
      onError: (errorKey) => {
        toast.error(t(errorKey));
        uploadResolversRef.current.shift()?.();
      },
    });

  // Sequentially upload a batch of files. Each call to uploadFile is awaited
  // via a resolver stored in uploadResolversRef so we don't race the
  // single-file state inside useUpload. No setState-in-effect needed.
  const existingImageCount = sessionData?.images.length ?? 0;
  const handleCorrectionFilesSelected = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setIsUploadingCorrection(true);
      try {
        for (let i = 0; i < files.length; i++) {
          resetUpload();
          await new Promise<void>((resolve) => {
            uploadResolversRef.current.push(resolve);
            uploadFile(
              files[i]!,
              existingImageCount + correctionImageIds.length + i,
            );
          });
        }
      } finally {
        setIsUploadingCorrection(false);
      }
    },
    [existingImageCount, resetUpload, uploadFile, correctionImageIds.length],
  );

  const images = useMemo(
    () =>
      (sessionData?.images ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [sessionData],
  );
  const questions = useMemo(() => sessionData?.questions ?? [], [sessionData]);
  const rounds = useMemo(() => sessionData?.checkRounds ?? [], [sessionData]);
  const status = sessionData?.status;
  const isCompleted = status === "COMPLETED";
  // Parents in the same family can load the canvas (getSession allows them
  // via verifyParentStudentAccess) but can't mutate — the mutation
  // procedures reject non-owner callers. Treating them as read-only here
  // hides the affordances they couldn't use anyway, so they don't get a
  // silent FORBIDDEN toast when they tap ✓/✗ etc.
  const isOwner = sessionData?.isOwner ?? false;
  const isReadOnly = isCompleted || !isOwner;

  const imageTabStats: ImageTabStats[] = useMemo(
    () =>
      images.map((img, i) => {
        const qs = questions.filter(
          (q) => (q.homeworkImageId ?? images[0]?.id) === img.id,
        );
        return {
          imageId: img.id,
          number: i + 1,
          total: qs.length,
          unjudged: qs.filter((q) => q.isCorrect === null).length,
          wrong: qs.filter((q) => q.isCorrect === false).length,
        };
      }),
    [images, questions],
  );

  // Derive active image from selectedImageId, with images[0] as fallback.
  // This covers "initial load" (selectedImageId is null) and "selected image
  // later gets deleted" (find returns undefined) in one branch.
  const activeImage = selectedImageId
    ? images.find((i) => i.id === selectedImageId) ?? images[0]
    : images[0];

  const questionsOnActive = useMemo(() => {
    if (!activeImage) return [];
    // Legacy rows without homeworkImageId fall through to the first image so
    // they still show up during the rollout. See ADR backfill note.
    const firstId = images[0]?.id;
    return questions.filter(
      (q) => (q.homeworkImageId ?? firstId) === activeImage.id,
    );
  }, [activeImage, questions, images]);

  const correctCount = questions.filter((q) => q.isCorrect === true).length;
  const wrongCount = questions.filter((q) => q.isCorrect === false).length;
  const unjudgedCount = questions.filter((q) => q.isCorrect === null).length;
  const totalScore =
    questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  const latestRound: CheckRound | undefined = rounds[rounds.length - 1];

  const openedQuestion: DetailSheetQuestion | null = useMemo(() => {
    if (!openQuestionId) return null;
    const q = questions.find((x) => x.id === openQuestionId);
    if (!q) return null;
    return {
      id: q.id,
      questionNumber: q.questionNumber,
      content: q.content,
      studentAnswer: q.studentAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect: q.isCorrect,
      needsReview: q.needsReview,
      aiKnowledgePoint: q.aiKnowledgePoint,
    };
  }, [openQuestionId, questions]);

  // --- Render guards ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground">{t("common.loading")}</p>
      </div>
    );
  }

  if (!session || !sessionData) {
    router.push("/check");
    return null;
  }

  if (status === "RECOGNIZING") {
    return <RecognitionOverlay open={true} />;
  }

  if (status === "RECOGNITION_FAILED" || status === "CREATED") {
    router.push(`/check/new?sessionId=${sessionId}`);
    return null;
  }

  // --- Handlers ---

  const handleTapQuestion = (qid: string) => {
    setOpenQuestionId(qid);
  };

  const handleToggleCorrect = (questionId: string, newValue: boolean) => {
    if (isReadOnly) return;
    updateQuestion.mutate({ questionId, isCorrect: newValue });
  };

  const handleDelete = (questionId: string) => {
    if (isReadOnly) return;
    deleteQuestion.mutate({ questionId });
  };

  const handleFinalize = () => {
    // RECOGNIZED path: first finalize creates round 1 from current isCorrect
    // values. Unjudged questions get a confirm dialog — once confirmed, the
    // mutation accepts them as whatever the AI guessed (isCorrect=false for
    // null). No force flag needed here: server creates round 1 regardless.
    if (status === "RECOGNIZED") {
      if (unjudgedCount > 0) {
        setConfirmCompleteOpen(true);
      } else {
        finalizeCheck.mutate({ sessionId });
      }
      return;
    }
    // CHECKING path: all-correct → direct finalize. Wrong-count>0 needs the
    // confirm dialog, and its "确定" button passes force=true to skip the
    // "can't finalize with wrong answers" server guard.
    if (status === "CHECKING") {
      if (wrongCount > 0) {
        setConfirmCompleteOpen(true);
      } else {
        finalizeCheck.mutate({ sessionId });
      }
    }
  };

  const handleConfirmFinalize = () => {
    // force is the CHECKING+wrong case; for RECOGNIZED the server doesn't
    // check force so passing it is harmless.
    const force = status === "CHECKING" && wrongCount > 0;
    finalizeCheck.mutate({ sessionId, force });
  };

  const handleOpenCorrection = () => {
    setCorrectionImageIds([]);
    uploadResolversRef.current = [];
    setCorrectionDialogOpen(true);
  };

  const handleSubmitCorrectionPhotos = () => {
    if (correctionImageIds.length === 0) return;
    void startCorrection({ sessionId, imageIds: correctionImageIds });
  };

  const progressLabel =
    status === "RECOGNIZED"
      ? t("homework.markup.progress", {
          done: questions.length - unjudgedCount,
          total: questions.length,
        })
      : status === "CHECKING"
        ? t("homework.check.scoreDisplay", {
            correct: latestRound?.correctCount ?? correctCount,
            total: latestRound?.totalQuestions ?? questions.length,
            score: latestRound?.score ?? totalScore,
          })
        : t("homework.check.finalScore", { score: sessionData.finalScore ?? 0 });

  return (
    <div className="space-y-3 pb-24">
      <Celebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push("/check")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">
              {isCompleted
                ? t("homework.check.completedTitle")
                : t("homework.markup.title")}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{progressLabel}</p>
          </div>
        </div>
        <Badge variant={isCompleted ? "default" : "secondary"} className="shrink-0">
          {t(`homework.status.${status}`)}
        </Badge>
      </div>

      {/* Completed banner — short + sweet */}
      {isCompleted && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/30 px-3 py-2 flex items-center gap-2 text-sm text-green-800 dark:text-green-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>
            {t("homework.check.finalScore", { score: sessionData.finalScore ?? 0 })}
          </span>
          <AdaptiveScore value={sessionData.finalScore ?? 0} className="ml-auto" />
        </div>
      )}

      {/* Round history (only shows with 1+ rounds, collapsed by default) */}
      <RoundHistoryDrawer rounds={rounds} />

      {/* Image tabs — hidden when session has exactly one photo */}
      <ImageTabSwitcher
        images={imageTabStats}
        activeImageId={activeImage?.id ?? ""}
        onSelect={(id) => setSelectedImageId(id)}
      />

      {/* Canvas or empty-state */}
      {questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-lg border border-dashed">
          <p>{t("homework.noQuestions")}</p>
        </div>
      ) : activeImage ? (
        <HomeworkCanvas
          imageId={activeImage.id}
          questions={questionsOnActive.map((q) => ({
            id: q.id,
            questionNumber: q.questionNumber,
            isCorrect: q.isCorrect,
            needsReview: q.needsReview,
            imageRegion: q.imageRegion,
          }))}
          onTapQuestion={handleTapQuestion}
          highlightedQuestionId={openQuestionId}
        />
      ) : null}

      {/* Tip row — pinch hint + summary. Hidden for non-owners / completed
         since there's nothing to do. */}
      {questions.length > 0 && !isReadOnly && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("homework.markup.pinchHint")}</span>
          <span>·</span>
          <span>{t("homework.markup.tapHint")}</span>
        </div>
      )}

      {/* Bottom action bar — owner only. Parents viewing a family-member's
         session see the canvas read-only (no action bar), and COMPLETED
         sessions collapse to the single "回到列表" button below. */}
      {!isReadOnly ? (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur px-4 py-3 flex items-center gap-2 sm:static sm:bg-transparent sm:border-none sm:backdrop-blur-0 sm:px-0 sm:pt-4">
          {status === "CHECKING" && wrongCount > 0 && (
            <AdaptiveButton
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={handleOpenCorrection}
            >
              <Camera className="h-4 w-4 mr-1" />
              {tC("check.recheck")}
            </AdaptiveButton>
          )}
          <AdaptiveButton
            size="lg"
            className="flex-1"
            disabled={
              questions.length === 0 ||
              finalizeCheck.isPending ||
              pendingCorrection
            }
            onClick={handleFinalize}
          >
            {finalizeCheck.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : null}
            {/* CHECKING+wrongCount>0 opens the "结束检查" confirm dialog
               where the student deliberately closes out with errors. Any
               other state just says "完成核对". Wonder-tier "全部做好了" would
               lie when wrong>0, so we use the neutral endCheck key there. */}
            {status === "CHECKING" && wrongCount > 0
              ? t("homework.markup.endCheck")
              : t("homework.markup.finalize")}
          </AdaptiveButton>
        </div>
      ) : (
        <div className="pt-4">
          <AdaptiveButton
            className="w-full"
            size="lg"
            onClick={() => router.push("/check")}
          >
            {tC("check.backToList")}
          </AdaptiveButton>
        </div>
      )}

      {/* Detail sheet */}
      <QuestionDetailSheet
        open={!!openQuestionId}
        onOpenChange={(o) => !o && setOpenQuestionId(null)}
        sessionId={sessionId}
        question={openedQuestion}
        canSeeCorrectAnswer={canSeeCorrectAnswer}
        isCompleted={isCompleted}
        canUseHelp={status === "CHECKING" || status === "COMPLETED"}
        readOnly={isReadOnly}
        onToggleCorrect={handleToggleCorrect}
        onDelete={handleDelete}
      />

      {/* Confirm-finalize dialog */}
      <Dialog open={confirmCompleteOpen} onOpenChange={setConfirmCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("homework.check.confirmCompleteTitle")}</DialogTitle>
            <DialogDescription>
              {status === "RECOGNIZED"
                ? t("homework.markup.confirmUnjudged", { count: unjudgedCount })
                : t("homework.check.confirmCompleteDesc", { count: wrongCount })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <AdaptiveButton
              variant="outline"
              onClick={() => setConfirmCompleteOpen(false)}
            >
              {t("common.cancel")}
            </AdaptiveButton>
            <AdaptiveButton
              onClick={handleConfirmFinalize}
              disabled={finalizeCheck.isPending}
            >
              {finalizeCheck.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {status === "CHECKING" && wrongCount > 0
                ? t("homework.markup.endCheck")
                : t("homework.markup.finalize")}
            </AdaptiveButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction-photos upload dialog (mirrors old /results behavior) */}
      <Dialog
        open={correctionDialogOpen}
        onOpenChange={(open) => {
          if (!submittingCorrection && !isUploadingCorrection && !pendingCorrection) {
            setCorrectionDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("homework.check.correctionFormTitle")}</DialogTitle>
            <DialogDescription>
              {t("homework.check.uploadCorrectionPhotos")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {correctionImageIds.length > 0 && !pendingCorrection && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <ImageIcon className="h-4 w-4" />
                {t("homework.check.correctionPhotosUploaded", {
                  count: correctionImageIds.length,
                })}
              </div>
            )}

            {isUploadingCorrection && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {correctionUploadProgress.status === "compressing"
                      ? t("homework.check.compressingPhoto")
                      : correctionUploadProgress.status === "confirming"
                        ? t("homework.check.confirmingPhoto")
                        : t("homework.check.uploadingPhoto")}
                  </span>
                  {correctionUploadProgress.status === "uploading" && (
                    <span className="tabular-nums text-xs">
                      {correctionUploadProgress.progress}%
                    </span>
                  )}
                </div>
                {correctionUploadProgress.status === "uploading" && (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-[width] duration-200"
                      style={{ width: `${correctionUploadProgress.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}

            {pendingCorrection ? (
              <div className="flex flex-col items-center justify-center gap-3 py-6 rounded-lg bg-muted/30">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <div className="text-center space-y-0.5">
                  <p className="text-sm font-medium">
                    {t("homework.check.gradingInProgress")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("homework.check.gradingSubtitle")}
                  </p>
                </div>
              </div>
            ) : (
              <PhotoCapture
                onFilesSelected={handleCorrectionFilesSelected}
                disabled={isUploadingCorrection || submittingCorrection}
                maxRemaining={MAX_IMAGES_PER_SESSION - correctionImageIds.length}
              />
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <AdaptiveButton
              variant="outline"
              onClick={() => setCorrectionDialogOpen(false)}
              disabled={
                submittingCorrection || isUploadingCorrection || pendingCorrection
              }
            >
              {t("common.cancel")}
            </AdaptiveButton>
            <AdaptiveButton
              onClick={handleSubmitCorrectionPhotos}
              disabled={
                correctionImageIds.length === 0 ||
                isUploadingCorrection ||
                submittingCorrection ||
                pendingCorrection
              }
            >
              {submittingCorrection || pendingCorrection ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("homework.check.submittingCorrections")}
                </>
              ) : (
                t("homework.check.submitCorrections")
              )}
            </AdaptiveButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
