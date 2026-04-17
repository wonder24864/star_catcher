"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useStudentStore } from "@/lib/stores/student-store";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GlassCard } from "@/components/pro/glass-card";
import { GradientMesh } from "@/components/pro/gradient-mesh";

const MIN_TASKS = 0;
const MAX_TASKS = 20;

type FormSnapshot = {
  maxDailyTasks: number;
  learningTimeStart: string;
  learningTimeEnd: string;
};

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
  const [initialSnapshot, setInitialSnapshot] = useState<FormSnapshot | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  // Sync form state when the server value arrives (and reset snapshot when
  // switching students — triggered by activeStudentId changing).
  useEffect(() => {
    if (learningControl) {
      const snapshot: FormSnapshot = {
        maxDailyTasks: learningControl.maxDailyTasks,
        learningTimeStart: learningControl.learningTimeStart ?? "",
        learningTimeEnd: learningControl.learningTimeEnd ?? "",
      };
      setMaxDailyTasks(snapshot.maxDailyTasks);
      setLearningTimeStart(snapshot.learningTimeStart);
      setLearningTimeEnd(snapshot.learningTimeEnd);
      setInitialSnapshot(snapshot);
    }
  }, [learningControl, activeStudentId]);

  const setLearningControl = trpc.parent.setLearningControl.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      const fresh: FormSnapshot = {
        maxDailyTasks,
        learningTimeStart,
        learningTimeEnd,
      };
      setInitialSnapshot(fresh);
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

  const dirtyFieldCount = useMemo(() => {
    if (!initialSnapshot) return 0;
    let n = 0;
    if (maxDailyTasks !== initialSnapshot.maxDailyTasks) n++;
    if (learningTimeStart !== initialSnapshot.learningTimeStart) n++;
    if (learningTimeEnd !== initialSnapshot.learningTimeEnd) n++;
    return n;
  }, [initialSnapshot, maxDailyTasks, learningTimeStart, learningTimeEnd]);

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

  const handleDiscard = () => {
    if (!initialSnapshot) return;
    setMaxDailyTasks(initialSnapshot.maxDailyTasks);
    setLearningTimeStart(initialSnapshot.learningTimeStart);
    setLearningTimeEnd(initialSnapshot.learningTimeEnd);
    setDiscardOpen(false);
  };

  if (!studentConfigs || studentConfigs.length === 0) {
    return (
      <div className="relative p-6">
        <GradientMesh className="absolute inset-0 -z-10 rounded-xl" />
        <p className="text-muted-foreground">
          {t("parent.settings.learning.noStudents")}
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <GradientMesh className="absolute inset-0 -z-10 rounded-xl" />
      <div className="relative mx-auto max-w-2xl space-y-6 p-6 pb-32">
        <div>
          <h1 className="text-2xl font-semibold">
            {t("parent.settings.learning.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("parent.settings.learning.subtitle")}
          </p>
        </div>

        {studentConfigs.length > 1 && (
          <GlassCard intensity="subtle" className="p-6">
            <h2 className="mb-3 text-base font-semibold">
              {t("parent.settings.learning.selectStudent")}
            </h2>
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
          </GlassCard>
        )}

        {activeStudent && (
          <>
            <GlassCard intensity="subtle" className="p-6">
              <h2 className="mb-3 text-base font-semibold">
                {t("parent.settings.learning.maxDailyTasks")}
              </h2>
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={MIN_TASKS}
                    max={MAX_TASKS}
                    step={1}
                    value={maxDailyTasks}
                    onChange={(e) => setMaxDailyTasks(Number(e.target.value))}
                    className="h-2 flex-1 cursor-pointer accent-primary"
                    aria-label={t("parent.settings.learning.maxDailyTasks")}
                  />
                  <span className="w-10 text-right text-xl font-semibold">
                    {maxDailyTasks}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("parent.settings.learning.maxDailyTasksHelp")}
                </p>
              </div>
            </GlassCard>

            <GlassCard intensity="subtle" className="p-6">
              <h2 className="mb-3 text-base font-semibold">
                {t("parent.settings.learning.learningTime")}
              </h2>
              <div className="space-y-4">
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
              </div>
            </GlassCard>

            <div>
              <Button variant="outline" onClick={() => setShowLogs((v) => !v)}>
                {showLogs
                  ? t("parent.settings.learning.hideLogs")
                  : t("parent.settings.learning.showLogs")}
              </Button>
            </div>

            {showLogs && (
              <GlassCard intensity="subtle" className="p-6">
                <h2 className="mb-3 text-base font-semibold">
                  {t("parent.settings.learning.operationLog")}
                </h2>
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
                          className="border-l-2 border-muted py-1 pl-3"
                        >
                          <div className="text-xs text-muted-foreground">
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
              </GlassCard>
            )}
          </>
        )}
      </div>

      {/* Sticky unsaved-changes bar */}
      <AnimatePresence>
        {dirtyFieldCount > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="sticky bottom-4 z-20 mx-auto max-w-2xl px-6"
          >
            <GlassCard
              intensity="strong"
              glow="subtle"
              className="flex flex-wrap items-center justify-between gap-3 p-4"
            >
              <span className="text-sm font-medium">
                {t("parent.settings.unsavedCount", { count: dirtyFieldCount })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setDiscardOpen(true)}
                  disabled={setLearningControl.isPending}
                >
                  {t("parent.settings.discard")}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!canSave || setLearningControl.isPending}
                >
                  {setLearningControl.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("parent.settings.learning.save")}
                </Button>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Discard-confirmation dialog */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("parent.settings.confirmDiscardTitle")}
            </DialogTitle>
            <DialogDescription>
              {t("parent.settings.confirmDiscardDesc", {
                count: dirtyFieldCount,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDiscard}>
              {t("parent.settings.discard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
