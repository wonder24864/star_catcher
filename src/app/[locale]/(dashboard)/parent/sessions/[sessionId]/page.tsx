"use client";

import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, X, TrendingUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { MathText } from "@/components/ui/math-text";

export default function ParentSessionDetailPage() {
  const t = useTranslations();
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();

  const { data: session, isLoading } = trpc.parent.sessionDetail.useQuery(
    { sessionId },
    { enabled: !!sessionId }
  );

  if (isLoading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!session) {
    return <p className="text-muted-foreground">{t("error.forbidden")}</p>;
  }

  const rounds = (session as unknown as { checkRounds: Round[] }).checkRounds ?? [];
  const questions = (session as unknown as { questions: Question[] }).questions ?? [];
  const helpRequests = (session as unknown as { helpRequests: HelpReq[] }).helpRequests ?? [];
  const wrongQuestions = questions.filter((q) => q.isCorrect !== true);

  // Group help requests by questionId
  const helpByQuestion = new Map<string, HelpReq[]>();
  for (const hr of helpRequests) {
    const arr = helpByQuestion.get(hr.sessionQuestionId) ?? [];
    arr.push(hr);
    helpByQuestion.set(hr.sessionQuestionId, arr);
  }

  const sessionData = session as unknown as {
    title: string | null;
    subject: string | null;
    status: string;
    finalScore: number | null;
    totalRounds: number;
    createdAt: string;
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">
            {sessionData.title ?? t("homework.untitled")}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            {sessionData.subject && (
              <Badge variant="secondary" className="text-xs">
                {t(`homework.subjects.${sessionData.subject}`)}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {new Date(sessionData.createdAt).toLocaleDateString("zh-CN")}
            </span>
            {sessionData.finalScore != null && (
              <span className="text-sm font-medium">
                {t("homework.score", { score: sessionData.finalScore })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score timeline */}
      {rounds.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4" />
              {t("homework.check.scoreHistory")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rounds.map((round) => {
                const corrected = round.results?.filter((r) => r.correctedFromPrev).length ?? 0;
                return (
                  <div key={round.id} className="flex items-center gap-3">
                    <Badge variant={rounds.indexOf(round) === rounds.length - 1 ? "default" : "secondary"}>
                      {t("homework.check.round", { round: round.roundNumber })}
                    </Badge>
                    <span className="text-sm">
                      {t("homework.check.scoreDisplay", {
                        correct: round.correctCount ?? 0,
                        total: round.totalQuestions ?? 0,
                        score: round.score ?? 0,
                      })}
                    </span>
                    {corrected > 0 && (
                      <span className="text-xs text-green-600">
                        {t("parent.session.corrected", { count: corrected })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help records */}
      {helpRequests.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              <Lightbulb className="h-4 w-4" />
              {t("parent.session.helpRecords")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {questions
              .filter((q) => helpByQuestion.has(q.id))
              .map((q) => {
                const hrs = helpByQuestion.get(q.id) ?? [];
                return (
                  <div key={q.id} className="space-y-1">
                    <p className="text-sm font-medium">
                      #{q.questionNumber} <MathText text={q.content.length > 60 ? q.content.slice(0, 60) + "…" : q.content} />
                    </p>
                    <div className="flex flex-wrap gap-1.5 pl-2">
                      {hrs.map((hr) => (
                        <Badge key={hr.id} variant="outline" className="text-xs">
                          L{hr.level} — {t(`homework.help.level${hr.level}` as `homework.help.level${1 | 2 | 3}`)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
          </CardContent>
        </Card>
      )}

      <Separator />

      {/* Question list */}
      <div>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          {t("parent.session.questionList")} ({questions.length})
        </h2>
        <div className="space-y-2">
          {questions.map((q) => (
            <Card
              key={q.id}
              className={cn(
                "border-l-4",
                q.isCorrect === true ? "border-l-green-500" : "border-l-red-500"
              )}
            >
              <CardContent className="py-3 flex items-start gap-3">
                <div
                  className={cn(
                    "flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5",
                    q.isCorrect === true ? "bg-green-100" : "bg-red-100"
                  )}
                >
                  {q.isCorrect === true ? (
                    <Check className="h-3.5 w-3.5 text-green-600" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-red-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">#{q.questionNumber}</span>
                    {q.aiKnowledgePoint && (
                      <Badge variant="secondary" className="text-xs">{q.aiKnowledgePoint}</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm"><MathText text={q.content} /></p>
                  {q.studentAnswer && (
                    <p className={cn("mt-0.5 text-xs", q.isCorrect ? "text-green-600" : "text-red-500")}>
                      {t("homework.studentAnswer")}: <MathText text={q.studentAnswer} />
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {wrongQuestions.length > 0 && (
        <Card className="bg-amber-50 border-amber-200">
          <CardContent className="py-3">
            <p className="text-sm text-amber-700">
              {t("parent.session.wrongRemaining", { count: wrongQuestions.length })}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type Round = {
  id: string;
  roundNumber: number;
  score: number | null;
  totalQuestions: number | null;
  correctCount: number | null;
  results: { sessionQuestionId: string; isCorrect: boolean; correctedFromPrev: boolean }[];
};

type Question = {
  id: string;
  questionNumber: number;
  content: string;
  studentAnswer: string | null;
  isCorrect: boolean | null;
  aiKnowledgePoint: string | null;
};

type HelpReq = {
  id: string;
  sessionQuestionId: string;
  level: number;
  aiResponse: string;
};
