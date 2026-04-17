"use client";

/**
 * Unified grade-switcher dialog used by UserTopBar.
 *
 * Supports three targets:
 * - `{ kind: "self" }`        → student updates own grade via user.updateProfile.
 * - `{ kind: "student", id }` → parent updates a linked student via parent.updateStudentProfile.
 * - `{ kind: "user", id }`    → admin updates any user via admin.updateUserProfile.
 *
 * The 12 grade buttons are laid out in a 3-column grid (primary / junior /
 * senior). Clicking Save fires the appropriate mutation + refreshes caches +
 * (for self) patches the next-auth session so tier/UserTopBar re-render
 * without a full page reload.
 */

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { GRADES, type Grade } from "@/lib/domain/validations/grade";

// Re-export so consumers (e.g. UserTopBar) can grab the Grade type from this
// component without a second import path.
export type { Grade };

export type GradeTarget =
  | { kind: "self" }
  | { kind: "student"; id: string }
  | { kind: "user"; id: string };

interface GradeSwitcherDialogProps {
  /** When non-null, dialog is open and mutation targets the specified subject. */
  target: GradeTarget | null;
  /** Display name of the subject (student's nickname for parent/admin, self for student). */
  subjectName: string;
  /** Current grade, shown as the pre-selected pill. */
  currentGrade: Grade | null;
  /** Parent is closing the dialog. */
  onClose: () => void;
}

export function GradeSwitcherDialog({
  target,
  subjectName,
  currentGrade,
  onClose,
}: GradeSwitcherDialogProps) {
  const t = useTranslations();
  const { update: updateSession } = useSession();
  const utils = trpc.useUtils();

  const [selected, setSelected] = useState<Grade | null>(currentGrade);

  // Keep local selection in sync when opening the dialog with a different
  // subject (e.g. parent switches between students).
  useEffect(() => {
    setSelected(currentGrade);
  }, [currentGrade, target]);

  const selfMutation = trpc.user.updateProfile.useMutation();
  const parentMutation = trpc.parent.updateStudentProfile.useMutation();
  const adminMutation = trpc.admin.updateUserProfile.useMutation();

  const isPending =
    selfMutation.isPending ||
    parentMutation.isPending ||
    adminMutation.isPending;

  async function handleSave() {
    if (!target || !selected || selected === currentGrade) {
      onClose();
      return;
    }
    try {
      if (target.kind === "self") {
        await selfMutation.mutateAsync({ grade: selected });
        // Patch the auth session so the tier/UserTopBar re-render immediately.
        await updateSession({ user: { grade: selected } });
      } else if (target.kind === "student") {
        await parentMutation.mutateAsync({ studentId: target.id, grade: selected });
      } else {
        await adminMutation.mutateAsync({ userId: target.id, grade: selected });
      }
      await utils.family.list.invalidate();
      toast.success(t("user.gradeUpdated"));
      onClose();
    } catch {
      toast.error(t("error.serverError"));
    }
  }

  // Derived from GRADES by prefix rather than by slice index — if the shared
  // grade list ever gains e.g. a KINDER_1, the primary section won't silently
  // absorb it.
  const groups: Array<{ label: string; grades: readonly Grade[] }> = [
    { label: t("user.gradeGroup.primary"), grades: GRADES.filter((g) => g.startsWith("PRIMARY_")) },
    { label: t("user.gradeGroup.junior"),  grades: GRADES.filter((g) => g.startsWith("JUNIOR_"))  },
    { label: t("user.gradeGroup.senior"),  grades: GRADES.filter((g) => g.startsWith("SENIOR_"))  },
  ];

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("user.changeGradeTitle")}</DialogTitle>
          <DialogDescription>
            {t("user.changeGradeSubtitle", { name: subjectName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {groups.map((g) => (
            <div key={g.label}>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.label}</p>
              <div className="grid grid-cols-3 gap-2">
                {g.grades.map((grade) => {
                  const isCurrent = grade === currentGrade;
                  const isSelected = grade === selected;
                  return (
                    <button
                      key={grade}
                      type="button"
                      onClick={() => setSelected(grade)}
                      disabled={isPending}
                      className={cn(
                        "rounded-md border px-3 py-2 text-sm font-medium transition-all",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border hover:bg-accent",
                        isCurrent && !isSelected && "ring-1 ring-primary/40",
                        isPending && "opacity-50 cursor-not-allowed",
                      )}
                    >
                      {t(`grades.${grade}` as never)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isPending || !selected || selected === currentGrade}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("common.saving")}
              </>
            ) : (
              t("common.save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
