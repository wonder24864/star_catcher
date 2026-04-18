"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Loader2, Users, Heart } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { useTier } from "@/components/providers/grade-tier-provider";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers/_app";

type Family = inferRouterOutputs<AppRouter>["family"]["list"][number];

export function FamilyInfoCard({ family }: { family: Family }) {
  const t = useTranslations();
  const { tier } = useTier();
  const parents = family.members
    .filter((m) => m.user.role === "PARENT")
    .map((m) => m.user.nickname);

  const cardClasses = cn(
    "relative overflow-hidden rounded-2xl p-4 sm:p-5",
    tier === "wonder" &&
      "bg-gradient-to-br from-emerald-100 to-teal-100 border-2 border-emerald-300",
    tier === "cosmic" &&
      "bg-emerald-950/30 border border-emerald-500/30 text-emerald-100",
    tier === "flow" && "bg-gradient-to-br from-emerald-50 to-sky-50 border",
    tier === "studio" && "bg-card border"
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cardClasses}
    >
      <div className="flex items-center gap-3">
        <div className="text-3xl" aria-hidden>
          👨‍👩‍👧
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm opacity-80">
            <Users className="h-3.5 w-3.5" />
            {t("student.familyInfo.label")}
          </div>
          <div className="mt-0.5 truncate text-lg sm:text-xl font-semibold">
            {family.name}
          </div>
          {parents.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 text-sm opacity-90">
              <Heart className="h-3.5 w-3.5" />
              <span className="truncate" title={parents.join(" · ")}>
                {t("student.familyInfo.parents", { list: parents.join("、") })}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function JoinFamilyCard() {
  const t = useTranslations();
  const { tier } = useTier();
  const utils = trpc.useUtils();

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const joinFamily = trpc.family.join.useMutation({
    onSuccess: (data) => {
      toast.success(t("student.joinFamily.success", { family: data.familyName }));
      setOpen(false);
      setCode("");
      setError("");
      utils.family.list.invalidate();
    },
    onError: (err) => {
      if (err.message === "INVALID_CODE") setError(t("student.joinFamily.errInvalid"));
      else if (err.message === "CODE_EXPIRED") setError(t("student.joinFamily.errExpired"));
      else if (err.message === "ALREADY_MEMBER") setError(t("student.joinFamily.errAlready"));
      else setError(t("error.serverError"));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) {
      setError(t("student.joinFamily.errFormat"));
      return;
    }
    setError("");
    joinFamily.mutate({ inviteCode: trimmed });
  };

  const cardClasses = cn(
    "relative overflow-hidden rounded-2xl p-5 sm:p-6 text-center",
    tier === "wonder" &&
      "bg-gradient-to-br from-amber-100 to-rose-100 border-2 border-dashed border-rose-300",
    tier === "cosmic" &&
      "bg-indigo-950/40 border border-indigo-500/30 text-indigo-100",
    tier === "flow" && "bg-gradient-to-br from-sky-50 to-indigo-50 border",
    tier === "studio" && "bg-muted/50 border"
  );

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className={cardClasses}
      >
        <div className="text-4xl mb-2" aria-hidden>
          👨‍👩‍👧
        </div>
        <div className="text-lg sm:text-xl font-semibold">
          {t("student.joinFamily.emptyTitle")}
        </div>
        <div className="mt-1 text-sm opacity-80">
          {t("student.joinFamily.emptySubtitle")}
        </div>
        <Button
          size="lg"
          className="mt-4 gap-2"
          onClick={() => setOpen(true)}
        >
          <Users className="h-4 w-4" />
          {t("student.joinFamily.action")}
        </Button>
      </motion.div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setError(""); setCode(""); } }}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{t("student.joinFamily.dialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("student.joinFamily.dialogDesc")}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-2">
              <Label htmlFor="invite-code">{t("family.inviteCode")}</Label>
              <Input
                id="invite-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD12"
                maxLength={6}
                autoComplete="off"
                className="font-mono tracking-widest text-center text-lg uppercase"
                disabled={joinFamily.isPending}
              />
              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={joinFamily.isPending}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={joinFamily.isPending || code.trim().length !== 6}>
                {joinFamily.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("common.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
