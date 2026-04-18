"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations, useLocale } from "next-intl";
import { ArrowLeft, Star, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { useTier } from "@/components/providers/grade-tier-provider";
import { Badge } from "@/components/ui/badge";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/ui/math-text";
import { AgentSummaryCard } from "@/components/agent-summary-card";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveSubjectBadge } from "@/components/adaptive/adaptive-subject-badge";
import { QuestionImage } from "@/components/homework/question-image";
import { ExplanationSection } from "@/components/errors/explanation-section";
import type {
  ExplanationCard as ExplanationCardData,
} from "@/lib/domain/ai/harness/schemas/generate-explanation";
import { SUBJECT_HEX_COLORS } from "@/lib/constants/subject-colors";
import { cn } from "@/lib/utils";

export default function ErrorDetailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const { tier, tierIndex } = useTier();

  const isParent = session?.user?.role === "PARENT";

  const utils = trpc.useUtils();
  const { data: eq, isLoading } = trpc.error.detail.useQuery({ id });

  const [noteContent, setNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const addNote = trpc.error.addNote.useMutation({
    onSuccess: () => {
      setNoteContent("");
      utils.error.detail.invalidate({ id });
      toast.success(t("common.success"));
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const editNote = trpc.error.editNote.useMutation({
    onSuccess: () => {
      setEditingNoteId(null);
      utils.error.detail.invalidate({ id });
      toast.success(t("common.success"));
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const deleteNote = trpc.error.deleteNote.useMutation({
    onSuccess: () => {
      utils.error.detail.invalidate({ id });
      toast.success(t("common.success"));
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const question = eq as
    | {
        id: string;
        studentId: string;
        subject: string;
        content: string;
        studentAnswer: string | null;
        correctAnswer: string | null;
        aiKnowledgePoint: string | null;
        isMastered: boolean;
        totalAttempts: number;
        createdAt: string | Date;
        explanation: unknown;
        sessionQuestion: {
          imageRegion: { x: number; y: number; w: number; h: number } | null;
          homeworkSession: { images: Array<{ id: string }> };
        } | null;
        parentNotes: Array<{
          id: string;
          content: string;
          createdAt: string | Date;
          parent: { nickname: string } | null;
        }>;
      }
    | undefined;

  const { data: agentTrace } = trpc.agentTrace.latestForQuestion.useQuery(
    {
      studentId: isParent ? question?.studentId : undefined,
      errorQuestionId: id,
    },
    { enabled: !!eq },
  );

  // D40: wonder tier uses gentle amber instead of harsh red for wrong answers
  const wrongAnswerColor = tierIndex === 1 ? "text-amber-600" : "text-red-600";

  if (isLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!question) return <p className="text-muted-foreground">{t("common.noData")}</p>;

  const subjectHex = SUBJECT_HEX_COLORS[question.subject] ?? "#6b7280";

  // Tier-specific question card styling
  const questionCardStyle =
    tier === "wonder"
      ? { boxShadow: `0 18px 40px -16px ${subjectHex}80` }
      : tier === "cosmic"
        ? {
            boxShadow: `inset 0 0 0 1px ${subjectHex}66, 0 0 28px -8px ${subjectHex}55`,
          }
        : undefined;
  const questionContentClass =
    tier === "wonder"
      ? "text-base sm:text-lg leading-relaxed"
      : "text-sm";

  return (
    <div className="max-w-2xl space-y-4 pt-12 md:pt-0">
      {/* Back link */}
      <Link
        href={`/${locale}/errors`}
        className={cn(
          "inline-flex items-center gap-1 text-sm hover:underline",
          tier === "wonder"
            ? "text-fuchsia-700 dark:text-fuchsia-300 font-medium"
            : "text-muted-foreground"
        )}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </Link>

      {/* Question card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <AdaptiveCard className="relative overflow-hidden" style={questionCardStyle}>
          {tier === "wonder" && (
            <div
              aria-hidden
              className="absolute left-0 top-0 bottom-0 w-2"
              style={{ backgroundColor: subjectHex }}
            />
          )}
          <CardHeader className={cn(tier === "wonder" && "pl-6")}>
            <div className="flex items-center gap-2 flex-wrap">
              <AdaptiveSubjectBadge subject={question.subject}>
                {t(`homework.subjects.${question.subject}`)}
              </AdaptiveSubjectBadge>
              {question.isMastered && (
                <Badge
                  variant="outline"
                  className={cn(
                    "gap-1",
                    tier === "wonder"
                      ? "bg-amber-100 text-amber-800 border-amber-400"
                      : tier === "cosmic"
                        ? "bg-emerald-500/20 text-emerald-200 border-emerald-400/50"
                        : "text-green-600 border-green-600"
                  )}
                >
                  {tier === "wonder" && <Star className="h-3 w-3 fill-amber-500" />}
                  {t("mastery.status.MASTERED")}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className={cn("space-y-3", tier === "wonder" && "pl-6")}>
            {/* Question's original image region (if OCR detected one) */}
            {question.sessionQuestion?.imageRegion &&
              question.sessionQuestion.homeworkSession.images[0]?.id && (
                <QuestionImage
                  imageId={question.sessionQuestion.homeworkSession.images[0].id}
                  region={question.sessionQuestion.imageRegion}
                  className="max-w-sm"
                />
              )}

            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("homework.questionContent")}</p>
              <p className={cn("whitespace-pre-wrap", questionContentClass)}>
                <MathText text={question.content} />
              </p>
            </div>

            {question.studentAnswer && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("homework.studentAnswer")}</p>
                <p className={cn(questionContentClass, wrongAnswerColor)}>
                  <MathText text={question.studentAnswer} />
                </p>
              </div>
            )}

            {/* Only parents can see correct answers; students should use the help system */}
            {isParent && question.correctAnswer && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("homework.correctAnswer")}</p>
                <p className={cn(questionContentClass, "text-green-600")}>
                  <MathText text={question.correctAnswer} />
                </p>
              </div>
            )}

            {question.aiKnowledgePoint && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("homework.knowledgePoint")}</p>
                <p
                  className={cn(
                    "inline-flex items-center gap-1",
                    questionContentClass,
                    tier === "wonder" &&
                      "rounded-full bg-gradient-to-r from-fuchsia-100 to-violet-100 px-3 py-1 text-fuchsia-800 font-medium",
                    tier === "cosmic" &&
                      "rounded-full bg-cyan-500/10 border border-cyan-400/40 px-3 py-1 text-cyan-200"
                  )}
                >
                  {(tier === "wonder" || tier === "cosmic") && (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  {question.aiKnowledgePoint}
                </p>
              </div>
            )}

            <div className="pt-2 text-xs text-muted-foreground flex gap-4">
              <span>{t("homework.attemptCount", { count: question.totalAttempts })}</span>
              <span>
                {new Date(question.createdAt).toLocaleDateString(
                  locale === "zh" ? "zh-CN" : "en-US",
                )}
              </span>
            </div>
          </CardContent>
        </AdaptiveCard>
      </motion.div>

      {/* Parent-only: AI-generated explanation (cached after first gen) */}
      {isParent && (
        <ExplanationSection
          errorQuestionId={question.id}
          cached={(question.explanation as ExplanationCardData | null) ?? null}
        />
      )}

      {/* Agent Analysis Summary */}
      <AgentSummaryCard trace={agentTrace} />

      {/* Parent notes section */}
      {(isParent || (question.parentNotes && question.parentNotes.length > 0)) && (
        <AdaptiveCard>
          <CardHeader>
            <CardTitle className="text-base">{t("parent.session.helpRecords")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {question.parentNotes.map((note) => (
              <div key={note.id} className="border-l-2 border-muted pl-3 py-1">
                {editingNoteId === note.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      maxLength={500}
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <AdaptiveButton
                        size="sm"
                        onClick={() => editNote.mutate({ noteId: note.id, content: editContent })}
                        disabled={editNote.isPending}
                      >
                        {t("common.save")}
                      </AdaptiveButton>
                      <AdaptiveButton size="sm" variant="outline" onClick={() => setEditingNoteId(null)}>
                        {t("common.cancel")}
                      </AdaptiveButton>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">
                        {note.parent?.nickname} &middot;{" "}
                        {new Date(note.createdAt).toLocaleString(
                          locale === "zh" ? "zh-CN" : "en-US",
                        )}
                      </p>
                      {isParent && session?.user?.id === (note as { parentId?: string }).parentId && (
                        <div className="flex gap-1">
                          <AdaptiveButton
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditContent(note.content);
                            }}
                          >
                            {t("common.edit")}
                          </AdaptiveButton>
                          <AdaptiveButton
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive"
                            onClick={() => deleteNote.mutate({ noteId: note.id })}
                            disabled={deleteNote.isPending}
                          >
                            {t("common.delete")}
                          </AdaptiveButton>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {isParent && (
              <div className="space-y-2 pt-2">
                <Textarea
                  placeholder={t("parent.session.addNotePlaceholder")}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{noteContent.length}/500</span>
                  <AdaptiveButton
                    size="sm"
                    onClick={() => addNote.mutate({ errorQuestionId: id, content: noteContent })}
                    disabled={!noteContent.trim() || addNote.isPending}
                  >
                    {t("common.submit")}
                  </AdaptiveButton>
                </div>
              </div>
            )}
          </CardContent>
        </AdaptiveCard>
      )}
    </div>
  );
}
