"use client";

/**
 * QuestionDetailSheet — bottom slide-up sheet for a single question.
 *
 * Sprint 17. Opens when the user taps a question box on the canvas.
 * Shows content + student answer + (role-gated) correct answer, lets the
 * user toggle correct/incorrect, and for wrong questions embeds the
 * 3-level HelpPanel.
 *
 * canSeeCorrectAnswer preserves the US-016 rule: STUDENT doesn't see
 * the AI-extracted correct answer during self-check, PARENT/ADMIN does.
 */

import { useTranslations } from "next-intl";
import { Check, X, AlertTriangle, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { MathText } from "@/components/ui/math-text";
import { cn } from "@/lib/utils";
import { HelpPanel } from "./help-panel";

export type DetailSheetQuestion = {
  id: string;
  questionNumber: number;
  content: string;
  studentAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  needsReview: boolean;
  aiKnowledgePoint: string | null;
};

export function QuestionDetailSheet({
  open,
  onOpenChange,
  sessionId,
  question,
  canSeeCorrectAnswer,
  isCompleted,
  canUseHelp,
  readOnly,
  onToggleCorrect,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  question: DetailSheetQuestion | null;
  canSeeCorrectAnswer: boolean;
  isCompleted: boolean;
  /** Server-side `requestHelp` requires status CHECKING or COMPLETED; we
   * hide the HelpPanel in RECOGNIZED so taps don't surface a 400 error. */
  canUseHelp: boolean;
  readOnly?: boolean;
  onToggleCorrect: (questionId: string, newValue: boolean) => void;
  onDelete?: (questionId: string) => void;
}) {
  const t = useTranslations();

  if (!question) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Mobile-first bottom sheet. Override the Dialog defaults
          // (center-centered, fixed width) to slide up from the bottom on
          // narrow screens. sm:+ keeps the centered dialog behavior.
          "top-auto bottom-0 left-0 translate-x-0 translate-y-0 w-full max-w-full rounded-b-none rounded-t-2xl p-4 sm:p-6",
          "sm:top-[50%] sm:bottom-auto sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:rounded-2xl",
          "max-h-[80vh] overflow-y-auto",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
        )}
      >
        <DialogTitle className="flex items-center gap-2 pr-8">
          <span className="text-base font-semibold">
            {t("homework.questionNumberShort", { number: question.questionNumber })}
          </span>
          {question.needsReview && (
            <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {t("homework.needsReview")}
            </Badge>
          )}
          {question.aiKnowledgePoint && (
            <AdaptiveSubjectBadge subject="MATH">
              {question.aiKnowledgePoint}
            </AdaptiveSubjectBadge>
          )}
        </DialogTitle>

        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <MathText text={question.content} />
          </div>

          <div className="grid gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">{t("homework.studentAnswer")}:</span>{" "}
              <span
                className={cn(
                  question.isCorrect === false && "text-red-600 font-medium",
                  question.isCorrect === true && "text-green-700",
                )}
              >
                {question.studentAnswer ? <MathText text={question.studentAnswer} /> : "—"}
              </span>
            </div>
            {canSeeCorrectAnswer && (
              <div>
                <span className="text-muted-foreground">
                  {t("homework.correctAnswer")}:
                </span>{" "}
                <span>
                  {question.correctAnswer ? <MathText text={question.correctAnswer} /> : "—"}
                </span>
              </div>
            )}
          </div>

          {/* Toggle correct / incorrect — explicit two-button pair so both
             states are always one tap away. Disabled after session is
             COMPLETED (history view). */}
          {!readOnly && (
            <div className="flex items-center gap-2 pt-1">
              <AdaptiveButton
                variant={question.isCorrect === true ? "default" : "outline"}
                size="sm"
                className={cn(
                  "flex-1",
                  question.isCorrect === true &&
                    "bg-green-600 text-white hover:bg-green-700",
                )}
                onClick={() => onToggleCorrect(question.id, true)}
              >
                <Check className="h-4 w-4 mr-1" />
                {t("homework.markCorrect")}
              </AdaptiveButton>
              <AdaptiveButton
                variant={question.isCorrect === false ? "destructive" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => onToggleCorrect(question.id, false)}
              >
                <X className="h-4 w-4 mr-1" />
                {t("homework.markIncorrect")}
              </AdaptiveButton>
            </div>
          )}

          {/* Help panel — only for wrong questions, and only after the
             session has actually entered CHECKING (server gates requestHelp
             on that). Auto-expanded so users don't need an extra tap. */}
          {question.isCorrect !== true && canUseHelp && (
            <HelpPanel
              sessionId={sessionId}
              questionId={question.id}
              isCorrect={question.isCorrect}
              isCompleted={isCompleted}
              defaultExpanded
            />
          )}

          {!readOnly && onDelete && (
            <div className="pt-2 border-t">
              <AdaptiveButton
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => onDelete(question.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                {t("homework.deleteQuestion")}
              </AdaptiveButton>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
