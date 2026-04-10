"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { toast } from "sonner";

const SUBJECTS = [
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
] as const;

const QUESTION_TYPES = [
  "CHOICE", "FILL_BLANK", "TRUE_FALSE", "SHORT_ANSWER",
  "CALCULATION", "ESSAY", "DICTATION_ITEM", "COPY_ITEM", "OTHER",
] as const;

export default function ManualInputPage() {
  const t = useTranslations();
  const router = useRouter();
  const { data: session } = useSession();
  const selectedStudentId = useStudentStore((s) => s.selectedStudentId);

  const isParent = session?.user?.role === "PARENT";
  const studentId = isParent ? selectedStudentId : session?.user?.id;

  const [content, setContent] = useState("");
  const [studentAnswer, setStudentAnswer] = useState("");
  const [correctAnswer, setCorrectAnswer] = useState("");
  const [questionType, setQuestionType] = useState<string | undefined>();
  const [subject, setSubject] = useState<string | undefined>();

  const createManualError = trpc.homework.createManualError.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      router.push("/check");
    },
    onError: () => toast.error(t("error.serverError")),
  });

  const handleSubmit = () => {
    if (!studentId || !content.trim()) return;
    createManualError.mutate({
      studentId,
      content: content.trim(),
      studentAnswer: studentAnswer.trim() || undefined,
      correctAnswer: correctAnswer.trim() || undefined,
      questionType: questionType as typeof QUESTION_TYPES[number] | undefined,
      subject: subject as typeof SUBJECTS[number] | undefined,
    });
  };

  if (isParent && !selectedStudentId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{t("homework.manual.title")}</h1>
        <p className="text-muted-foreground">{t("homework.selectStudent")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/check")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("homework.manual.title")}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("homework.manual.formTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Question content (required) */}
          <div className="space-y-1.5">
            <Label>{t("homework.questionContent")} *</Label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder={t("homework.manual.contentPlaceholder")}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          {/* Student answer (optional) */}
          <div className="space-y-1.5">
            <Label>{t("homework.studentAnswer")}</Label>
            <Input
              placeholder={t("homework.manual.studentAnswerPlaceholder")}
              value={studentAnswer}
              onChange={(e) => setStudentAnswer(e.target.value)}
            />
          </div>

          {/* Correct answer (optional) */}
          <div className="space-y-1.5">
            <Label>{t("homework.correctAnswer")}</Label>
            <Input
              placeholder={t("homework.manual.correctAnswerPlaceholder")}
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
            />
          </div>

          {/* Question type (optional) */}
          <div className="space-y-1.5">
            <Label>{t("homework.manual.questionType")}</Label>
            <Select value={questionType} onValueChange={setQuestionType}>
              <SelectTrigger>
                <SelectValue placeholder={t("homework.manual.selectQuestionType")} />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map((qt) => (
                  <SelectItem key={qt} value={qt}>
                    {t(`homework.manual.questionTypes.${qt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Subject override (optional — auto-detected by AI) */}
          <div className="space-y-1.5">
            <Label>
              {t("homework.subject")}
              <span className="text-xs text-muted-foreground ml-2">
                {t("homework.manual.subjectAutoDetect")}
              </span>
            </Label>
            <Select value={subject} onValueChange={setSubject}>
              <SelectTrigger>
                <SelectValue placeholder={t("homework.manual.autoDetect")} />
              </SelectTrigger>
              <SelectContent>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`homework.subjects.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Submit */}
          <Button
            className="w-full"
            size="lg"
            disabled={!content.trim() || createManualError.isPending}
            onClick={handleSubmit}
          >
            <Save className="h-4 w-4 mr-2" />
            {createManualError.isPending
              ? t("homework.manual.saving")
              : t("homework.manual.save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
