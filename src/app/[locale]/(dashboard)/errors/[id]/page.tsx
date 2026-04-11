"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { MathText } from "@/components/ui/math-text";
import { AgentSummaryCard } from "@/components/agent-summary-card";

const SUBJECT_COLORS: Record<string, string> = {
  MATH: "bg-blue-100 text-blue-800",
  CHINESE: "bg-red-100 text-red-800",
  ENGLISH: "bg-green-100 text-green-800",
  PHYSICS: "bg-purple-100 text-purple-800",
  CHEMISTRY: "bg-yellow-100 text-yellow-800",
  BIOLOGY: "bg-teal-100 text-teal-800",
  POLITICS: "bg-orange-100 text-orange-800",
  HISTORY: "bg-amber-100 text-amber-800",
  GEOGRAPHY: "bg-cyan-100 text-cyan-800",
  OTHER: "bg-gray-100 text-gray-800",
};

export default function ErrorDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();

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

  if (isLoading) return <p className="text-muted-foreground">{t("common.loading")}</p>;
  if (!eq) return <p className="text-muted-foreground">{t("common.noData")}</p>;

  const question = eq as {
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
    parentNotes: Array<{
      id: string;
      content: string;
      createdAt: string | Date;
      parent: { nickname: string } | null;
    }>;
  };

  const { data: agentTrace } = trpc.agentTrace.latestForQuestion.useQuery(
    {
      studentId: isParent ? question.studentId : undefined,
      errorQuestionId: id,
    },
    { enabled: !!eq },
  );

  return (
    <div className="max-w-2xl space-y-4">
      {/* Back link */}
      <Link href="/errors" className="text-sm text-muted-foreground hover:underline">
        ← {t("common.back")}
      </Link>

      {/* Question card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Badge className={SUBJECT_COLORS[question.subject] || SUBJECT_COLORS.OTHER}>
              {t(`homework.subjects.${question.subject}`)}
            </Badge>
            {question.isMastered && (
              <Badge variant="outline" className="text-green-600 border-green-600">
                已掌握
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("homework.questionContent")}</p>
            <p className="text-sm whitespace-pre-wrap"><MathText text={question.content} /></p>
          </div>

          {question.studentAnswer && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("homework.studentAnswer")}</p>
              <p className="text-sm text-red-600"><MathText text={question.studentAnswer} /></p>
            </div>
          )}

          {/* Only parents can see correct answers; students should use the help system */}
          {isParent && question.correctAnswer && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("homework.correctAnswer")}</p>
              <p className="text-sm text-green-600"><MathText text={question.correctAnswer} /></p>
            </div>
          )}

          {question.aiKnowledgePoint && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("homework.knowledgePoint")}</p>
              <p className="text-sm">{question.aiKnowledgePoint}</p>
            </div>
          )}

          <div className="pt-2 text-xs text-muted-foreground flex gap-4">
            <span>出错 {question.totalAttempts} 次</span>
            <span>{new Date(question.createdAt).toLocaleDateString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Agent Analysis Summary */}
      <AgentSummaryCard trace={agentTrace} />

      {/* Parent notes section */}
      {(isParent || (question.parentNotes && question.parentNotes.length > 0)) && (
        <Card>
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
                      <Button
                        size="sm"
                        onClick={() => editNote.mutate({ noteId: note.id, content: editContent })}
                        disabled={editNote.isPending}
                      >
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingNoteId(null)}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground">
                        {note.parent?.nickname} · {new Date(note.createdAt).toLocaleString()}
                      </p>
                      {isParent && session?.user?.id === (note as { parentId?: string }).parentId && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditContent(note.content);
                            }}
                          >
                            {t("common.edit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive"
                            onClick={() => deleteNote.mutate({ noteId: note.id })}
                            disabled={deleteNote.isPending}
                          >
                            {t("common.delete")}
                          </Button>
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
                  placeholder="添加家长备注（最多500字）"
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  maxLength={500}
                  rows={3}
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{noteContent.length}/500</span>
                  <Button
                    size="sm"
                    onClick={() => addNote.mutate({ errorQuestionId: id, content: noteContent })}
                    disabled={!noteContent.trim() || addNote.isPending}
                  >
                    {t("common.submit")}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
