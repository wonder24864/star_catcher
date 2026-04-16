"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import {
  ArrowLeft,
  Check,
  X,
  TrendingUp,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Camera,
  ImageIcon,
  Trash2,
  HelpCircle,
  Lock,
  Lightbulb,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PhotoCapture } from "@/components/homework/photo-capture";
import { useUpload, type UploadProgress } from "@/hooks/use-upload";
import { MAX_IMAGES_PER_SESSION } from "@/lib/domain/validations/upload";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveScore } from "@/components/adaptive/adaptive-score";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { Celebration } from "@/components/animation/celebration";
import { useTier } from "@/components/providers/grade-tier-provider";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

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

type HelpRequest = {
  id: string;
  level: number;
  aiResponse: string;
  createdAt: Date;
};

/** Inline help panel for a single question */
function QuestionHelpPanel({
  sessionId,
  questionId,
  isCorrect,
  isCompleted,
}: {
  sessionId: string;
  questionId: string;
  isCorrect: boolean | null;
  isCompleted: boolean;
}) {
  const t = useTranslations();
  const tH = useTierTranslations("homework");
  const { tierIndex } = useTier();
  const isWonder = tierIndex === 1;
  const [expanded, setExpanded] = useState(false);
  const [pendingHelp, setPendingHelp] = useState(false);

  const utils = trpc.useUtils();

  const { data: helpRequests = [] } = trpc.homework.getHelpRequests.useQuery(
    { sessionId, questionId },
    { enabled: expanded }
  );

  // SSE subscription: listen for help generation completion
  trpc.subscription.onHelpGenerated.useSubscription(
    { sessionId, questionId },
    {
      enabled: pendingHelp,
      onData: (event) => {
        if (event.type === "help-generate") {
          setPendingHelp(false);
          utils.homework.getHelpRequests.invalidate({ sessionId, questionId });
          if (event.status === "failed") {
            toast.error(t("homework.help.generationFailed"));
          }
        }
      },
    }
  );

  const requestHelp = trpc.homework.requestHelp.useMutation({
    onSuccess: (data) => {
      if ("status" in data && data.status === "processing") {
        // Job enqueued, wait for SSE notification
        setPendingHelp(true);
      } else {
        // Cache hit — help already exists, just refresh
        utils.homework.getHelpRequests.invalidate({ sessionId, questionId });
      }
    },
    onError: (err) => {
      const msg = err.message;
      if (msg === "NEW_ANSWER_REQUIRED_TO_UNLOCK") {
        toast.error(t("homework.help.locked"));
      } else if (msg === "HELP_LEVEL_EXCEEDS_MAX") {
        toast.error(t("homework.help.lockedByParent", { level: "" }));
      } else if (msg === "HELP_GENERATION_FAILED") {
        toast.error(t("homework.help.generationFailed"));
      } else {
        toast.error(t("error.serverError"));
      }
    },
  });

  if (isCorrect === true) return null;

  const helpMap = new Map(helpRequests.map((h: HelpRequest) => [h.level, h]));
  const maxRevealedLevel = helpRequests.length > 0
    ? Math.max(...helpRequests.map((h: HelpRequest) => h.level))
    : 0;
  const nextLevel = (maxRevealedLevel + 1) as 1 | 2 | 3;

  const levelLabels: Record<number, string> = {
    1: t("homework.help.level1"),
    2: t("homework.help.level2"),
    3: t("homework.help.level3"),
  };

  const handleRequestHelp = (level: 1 | 2 | 3) => {
    requestHelp.mutate({ sessionId, questionId, level });
  };

  // Wonder tier uses warmer background colors for hints
  const hintBg = isWonder ? "bg-amber-50" : "bg-blue-50";
  const hintBorder = isWonder ? "border-amber-200" : "border-blue-200";
  const hintIconColor = isWonder ? "text-amber-600" : "text-blue-600";
  const hintLabelColor = isWonder ? "text-amber-700" : "text-blue-700";

  return (
    <div className="mt-2">
      <AdaptiveButton
        variant="ghost"
        size="sm"
        className={cn(hintIconColor, "gap-1.5")}
        onClick={() => setExpanded(!expanded)}
      >
        <HelpCircle className="h-3.5 w-3.5" />
        {tH("help.button")}
        {expanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </AdaptiveButton>

      {expanded && (
        <div className={cn("mt-2 space-y-2 pl-2 border-l-2", hintBorder)}>
          {/* Show all revealed levels */}
          {[1, 2, 3].map((level) => {
            const help = helpMap.get(level);
            if (!help) return null;
            return (
              <div key={level} className={cn(hintBg, "rounded-lg p-3")}>
                <div className="flex items-center gap-2 mb-1.5">
                  <Lightbulb className={cn("h-3.5 w-3.5", hintIconColor)} />
                  <span className={cn("text-xs font-semibold", hintLabelColor)}>
                    {t("homework.help.title", { level })} — {levelLabels[level]}
                  </span>
                </div>
                <div className="text-sm text-gray-700 whitespace-pre-wrap">
                  {help.aiResponse}
                </div>
              </div>
            );
          })}

          {/* Next level button or locked indicator */}
          {!isCompleted && nextLevel <= 3 && (
            <AdaptiveButton
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={requestHelp.isPending}
              onClick={() => handleRequestHelp(nextLevel)}
            >
              {requestHelp.isPending ? (
                t("homework.help.loading")
              ) : (
                <>
                  <Lightbulb className="h-3.5 w-3.5" />
                  {t("homework.help.nextLevel", { level: nextLevel })}
                </>
              )}
            </AdaptiveButton>
          )}

          {maxRevealedLevel >= 3 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              {tH("help.maxLevelReached")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function CheckResultsPage() {
  const t = useTranslations();
  const tC = useTierTranslations("homework");
  const router = useRouter();
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { tierIndex } = useTier();

  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  // Correction photo upload state
  const [correctionImageIds, setCorrectionImageIds] = useState<string[]>([]);
  const [uploadQueue, setUploadQueue] = useState<File[]>([]);
  const [isUploadingCorrection, setIsUploadingCorrection] = useState(false);
  const [pendingCorrection, setPendingCorrection] = useState(false);

  const utils = trpc.useUtils();

  const { data: session, isLoading } = trpc.homework.getCheckStatus.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  // SSE subscription: listen for correction photos job completion
  trpc.subscription.onSessionJobComplete.useSubscription(
    { sessionId },
    {
      enabled: pendingCorrection,
      onData: (event) => {
        if (event.type === "correction-photos") {
          setPendingCorrection(false);
          utils.homework.getCheckStatus.invalidate({ sessionId });
          if (event.status === "completed") {
            toast.success(t("homework.check.recheckSuccess", { round: "" }));
          } else {
            toast.error(t("error.serverError"));
          }
          setCorrectionDialogOpen(false);
          setCorrectionImageIds([]);
        }
      },
    }
  );

  const completeSession = trpc.homework.completeSession.useMutation({
    onSuccess: () => {
      utils.homework.getCheckStatus.invalidate({ sessionId });
      toast.success(t("homework.check.completedTitle"));
      setConfirmCompleteOpen(false);
      // Trigger celebration if all correct
      if (wrongCount === 0) setShowCelebration(true);
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const submitCorrectionPhotos = trpc.homework.submitCorrectionPhotos.useMutation({
    onSuccess: () => {
      setPendingCorrection(true);
    },
    onError: (err) => {
      if (err.message === "DATA_CONFLICT") {
        toast.error(t("error.dataConflict"));
      } else {
        toast.error(t("error.serverError"));
      }
    },
  });

  // Upload hook for correction photos
  const { upload: uploadFile, uploadProgress: correctionUploadProgress, reset: resetUpload } = useUpload({
    sessionId,
    onSuccess: (image) => {
      setCorrectionImageIds((prev) => [...prev, image.id]);
      setIsUploadingCorrection(false);
      // Process next file in queue
      setUploadQueue((prev) => prev.slice(1));
    },
    onError: (errorKey) => {
      toast.error(t(errorKey));
      setIsUploadingCorrection(false);
      setUploadQueue((prev) => prev.slice(1));
    },
  });

  // Process upload queue
  useEffect(() => {
    if (uploadQueue.length > 0 && !isUploadingCorrection) {
      setIsUploadingCorrection(true);
      resetUpload();
      const nextSortOrder = (session as unknown as { images?: unknown[] })?.images?.length ?? 0;
      uploadFile(uploadQueue[0], nextSortOrder + correctionImageIds.length);
    }
  }, [uploadQueue, isUploadingCorrection, resetUpload, uploadFile, correctionImageIds.length, session]);

  const handleCorrectionFilesSelected = useCallback((files: File[]) => {
    setUploadQueue((prev) => [...prev, ...files]);
  }, []);

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
  const wrongQuestions = questions.filter((q) => q.isCorrect !== true);
  const wrongCount = wrongQuestions.length;
  const isCompleted = sessionData.status === "COMPLETED";

  const handleRecheckClick = () => {
    setCorrectionImageIds([]);
    setUploadQueue([]);
    setCorrectionDialogOpen(true);
  };

  const handleSubmitCorrectionPhotos = () => {
    if (correctionImageIds.length === 0) return;
    submitCorrectionPhotos.mutate({ sessionId, imageIds: correctionImageIds });
  };

  const handleCompleteClick = () => {
    if (wrongCount > 0) {
      setConfirmCompleteOpen(true);
    } else {
      completeSession.mutate({ sessionId });
    }
  };

  return (
    <div className="space-y-4">
      {/* Celebration overlay */}
      <Celebration
        show={showCelebration}
        onComplete={() => setShowCelebration(false)}
      />

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
        <AdaptiveCard className="bg-green-50 border-green-200 dark:bg-green-950/30">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
            <p className="font-semibold text-green-700 dark:text-green-200">
              {t("homework.check.finalScore", {
                score: sessionData.finalScore ?? 0,
              })}
            </p>
          </CardContent>
        </AdaptiveCard>
      )}

      {/* Score history (visible when >1 round) */}
      {rounds.length > 1 && (
        <AdaptiveCard>
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
                    <AdaptiveScore
                      value={r.score ?? 0}
                      className="ml-1"
                      tierOverride="studio"
                    />
                  </Badge>
                </span>
              ))}
            </div>
          </CardContent>
        </AdaptiveCard>
      )}

      {/* Question list — correct/incorrect only, NO correct answers */}
      <div className="space-y-2">
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
                q.isCorrect === true ? "border-l-green-500" : "border-l-red-500"
              )}
            >
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
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
                        <AdaptiveSubjectBadge subject="MATH">
                          {q.aiKnowledgePoint}
                        </AdaptiveSubjectBadge>
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
                    <p className="mt-1 text-sm"><MathText text={q.content} /></p>
                    {q.studentAnswer && (
                      <p
                        className={cn(
                          "mt-1 text-xs",
                          q.isCorrect === true
                            ? "text-green-600"
                            : "text-red-500"
                        )}
                      >
                        {t("homework.studentAnswer")}: <MathText text={q.studentAnswer} />
                      </p>
                    )}
                    {/* correctAnswer intentionally NOT shown per US-016 */}

                    {/* Help panel for wrong questions (US-018) */}
                    <QuestionHelpPanel
                      sessionId={sessionId}
                      questionId={q.id}
                      isCorrect={q.isCorrect}
                      isCompleted={isCompleted}
                    />
                  </div>
                </div>
              </CardContent>
            </AdaptiveCard>
          </motion.div>
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
          <AdaptiveButton
            variant="outline"
            size="lg"
            disabled={wrongCount === 0}
            onClick={handleRecheckClick}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {tC("check.recheck")}
          </AdaptiveButton>
          <AdaptiveButton
            size="lg"
            onClick={handleCompleteClick}
            disabled={completeSession.isPending}
          >
            {tC("check.complete")}
          </AdaptiveButton>
        </div>
      ) : (
        <div className="pt-4 border-t">
          <AdaptiveButton
            className="w-full"
            size="lg"
            onClick={() => router.push("/check")}
          >
            {tC("check.backToList")}
          </AdaptiveButton>
        </div>
      )}

      {/* Correction photo upload dialog */}
      <Dialog open={correctionDialogOpen} onOpenChange={(open) => {
        if (!submitCorrectionPhotos.isPending && !isUploadingCorrection) {
          setCorrectionDialogOpen(open);
        }
      }}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("homework.check.correctionFormTitle")}</DialogTitle>
            <DialogDescription>
              {t("homework.check.uploadCorrectionPhotos")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Uploaded photo count */}
            {correctionImageIds.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-green-600">
                <ImageIcon className="h-4 w-4" />
                {t("homework.check.correctionPhotosUploaded", { count: correctionImageIds.length })}
              </div>
            )}

            {/* Upload progress */}
            {isUploadingCorrection && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("homework.check.uploadingPhoto")}
              </div>
            )}

            {/* Photo capture */}
            <PhotoCapture
              onFilesSelected={handleCorrectionFilesSelected}
              disabled={isUploadingCorrection || submitCorrectionPhotos.isPending}
              maxRemaining={MAX_IMAGES_PER_SESSION - correctionImageIds.length}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <AdaptiveButton
              variant="outline"
              onClick={() => setCorrectionDialogOpen(false)}
              disabled={submitCorrectionPhotos.isPending || isUploadingCorrection}
            >
              {t("common.cancel")}
            </AdaptiveButton>
            <AdaptiveButton
              onClick={handleSubmitCorrectionPhotos}
              disabled={
                correctionImageIds.length === 0 ||
                isUploadingCorrection ||
                submitCorrectionPhotos.isPending
              }
            >
              {submitCorrectionPhotos.isPending ? (
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
            <AdaptiveButton
              variant="outline"
              onClick={() => setConfirmCompleteOpen(false)}
            >
              {t("common.cancel")}
            </AdaptiveButton>
            <AdaptiveButton
              onClick={() => completeSession.mutate({ sessionId })}
              disabled={completeSession.isPending}
            >
              {tC("check.complete")}
            </AdaptiveButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
