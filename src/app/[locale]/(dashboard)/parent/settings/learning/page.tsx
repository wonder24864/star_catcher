"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MIN_TASKS = 0;
const MAX_TASKS = 20;

export default function ParentLearningSettingsPage() {
  const t = useTranslations();
  const { selectedStudentId, setSelectedStudentId } = useStudentStore();

  const utils = trpc.useUtils();
  const { data: studentConfigs } = trpc.parent.getStudentConfigs.useQuery();

  // Auto-select first student if none selected yet
  useEffect(() => {
    if (!selectedStudentId && studentConfigs && studentConfigs.length > 0) {
      setSelectedStudentId(studentConfigs[0].studentId);
    }
  }, [selectedStudentId, studentConfigs, setSelectedStudentId]);

  const activeStudentId = selectedStudentId ?? studentConfigs?.[0]?.studentId ?? null;

  const { data: learningControl } = trpc.parent.getLearningControl.useQuery(
    { studentId: activeStudentId ?? "" },
    { enabled: !!activeStudentId },
  );

  const { data: settingLogs } = trpc.parent.recentSettingLogs.useQuery(
    { studentId: activeStudentId ?? "", limit: 10 },
    { enabled: !!activeStudentId },
  );

  const [maxDailyTasks, setMaxDailyTasks] = useState<number>(10);
  const [learningTimeStart, setLearningTimeStart] = useState<string>("");
  const [learningTimeEnd, setLearningTimeEnd] = useState<string>("");
  const [showLogs, setShowLogs] = useState(false);

  // Sync form state when the server value arrives
  useEffect(() => {
    if (learningControl) {
      setMaxDailyTasks(learningControl.maxDailyTasks);
      setLearningTimeStart(learningControl.learningTimeStart ?? "");
      setLearningTimeEnd(learningControl.learningTimeEnd ?? "");
    }
  }, [learningControl]);

  const setLearningControl = trpc.parent.setLearningControl.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      if (activeStudentId) {
        utils.parent.getLearningControl.invalidate({ studentId: activeStudentId });
        utils.parent.recentSettingLogs.invalidate({ studentId: activeStudentId });
        utils.parent.getStudentConfigs.invalidate();
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const activeStudent = useMemo(
    () => studentConfigs?.find((s) => s.studentId === activeStudentId),
    [studentConfigs, activeStudentId],
  );

  const canSave =
    (learningTimeStart === "" && learningTimeEnd === "") ||
    (learningTimeStart !== "" && learningTimeEnd !== "");

  const handleSave = () => {
    if (!activeStudentId) return;
    setLearningControl.mutate({
      studentId: activeStudentId,
      maxDailyTasks,
      learningTimeStart: learningTimeStart === "" ? null : learningTimeStart,
      learningTimeEnd: learningTimeEnd === "" ? null : learningTimeEnd,
    });
  };

  if (!studentConfigs || studentConfigs.length === 0) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">
          {t("parent.settings.learning.noStudents")}
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">
          {t("parent.settings.learning.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("parent.settings.learning.subtitle")}
        </p>
      </div>

      {studentConfigs.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("parent.settings.learning.selectStudent")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select
              value={activeStudentId ?? ""}
              onValueChange={setSelectedStudentId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {studentConfigs.map((s) => (
                  <SelectItem key={s.studentId} value={s.studentId}>
                    {s.nickname}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {activeStudent && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>
                {t("parent.settings.learning.maxDailyTasks")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={MIN_TASKS}
                  max={MAX_TASKS}
                  step={1}
                  value={maxDailyTasks}
                  onChange={(e) => setMaxDailyTasks(Number(e.target.value))}
                  className="flex-1 h-2 accent-primary cursor-pointer"
                  aria-label={t("parent.settings.learning.maxDailyTasks")}
                />
                <span className="text-xl font-semibold w-10 text-right">
                  {maxDailyTasks}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("parent.settings.learning.maxDailyTasksHelp")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                {t("parent.settings.learning.learningTime")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="learning-start">
                    {t("parent.settings.learning.start")}
                  </Label>
                  <input
                    id="learning-start"
                    type="time"
                    value={learningTimeStart}
                    onChange={(e) => setLearningTimeStart(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="learning-end">
                    {t("parent.settings.learning.end")}
                  </Label>
                  <input
                    id="learning-end"
                    type="time"
                    value={learningTimeEnd}
                    onChange={(e) => setLearningTimeEnd(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {t("parent.settings.learning.learningTimeHelp")}
              </p>
              {!canSave && (
                <p className="text-sm text-destructive">
                  {t("parent.settings.learning.timePairRequired")}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              disabled={!canSave || setLearningControl.isPending}
            >
              {t("parent.settings.learning.save")}
            </Button>
            <Button variant="outline" onClick={() => setShowLogs((v) => !v)}>
              {showLogs
                ? t("parent.settings.learning.hideLogs")
                : t("parent.settings.learning.showLogs")}
            </Button>
          </div>

          {showLogs && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {t("parent.settings.learning.operationLog")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {settingLogs && settingLogs.length > 0 ? (
                  <ul className="space-y-2 text-sm">
                    {settingLogs.map((log) => {
                      const details = log.details as
                        | {
                            maxDailyTasks?: number;
                            learningTimeStart?: string | null;
                            learningTimeEnd?: string | null;
                          }
                        | null;
                      return (
                        <li
                          key={log.id}
                          className="border-l-2 border-muted pl-3 py-1"
                        >
                          <div className="text-muted-foreground text-xs">
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                          <div>
                            {t("parent.settings.learning.maxDailyTasks")}:{" "}
                            {details?.maxDailyTasks ?? "-"}
                            {" · "}
                            {t("parent.settings.learning.learningTime")}:{" "}
                            {details?.learningTimeStart ?? "-"}-
                            {details?.learningTimeEnd ?? "-"}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("parent.settings.learning.noLogs")}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
