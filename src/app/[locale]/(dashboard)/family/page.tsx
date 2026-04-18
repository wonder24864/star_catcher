"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { Loader2, Pencil } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type ConfirmAction =
  | {
      type: "remove";
      familyId: string;
      userId: string;
      memberName: string;
    }
  | {
      type: "leave";
      familyId: string;
      familyName: string;
    };

type RenameState = { familyId: string; current: string } | null;

export default function FamilyPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const isParent = session?.user?.role === "PARENT";

  const { data: families } = trpc.family.list.useQuery();
  const utils = trpc.useUtils();

  // Create family
  const [createName, setCreateName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const createFamily = trpc.family.create.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      setCreateName("");
      setCreateOpen(false);
      utils.family.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Join family
  const [joinCode, setJoinCode] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinError, setJoinError] = useState("");
  const joinFamily = trpc.family.join.useMutation({
    onSuccess: (data) => {
      toast.success(`${t("common.success")} - ${data.familyName}`);
      setJoinCode("");
      setJoinOpen(false);
      setJoinError("");
      utils.family.list.invalidate();
    },
    onError: (error) => {
      if (error.message === "INVALID_CODE") setJoinError(t("error.required"));
      else if (error.message === "CODE_EXPIRED") setJoinError(t("error.rateLimitExceeded"));
      else if (error.message === "ALREADY_MEMBER") setJoinError(t("error.dataConflict"));
      else setJoinError(t("error.serverError"));
    },
  });

  // Refresh invite code
  const refreshCode = trpc.family.refreshInviteCode.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      utils.family.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Rename family (OWNER only)
  const [renameState, setRenameState] = useState<RenameState>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const renameFamily = trpc.family.rename.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      setRenameState(null);
      setRenameDraft("");
      utils.family.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Remove member (covers both "remove other" and "leave self")
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const removeMember = trpc.family.removeMember.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      setConfirmAction(null);
      utils.family.list.invalidate();
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirmAction(null);
    },
  });

  const confirmTitle =
    confirmAction?.type === "leave"
      ? t("family.confirmLeaveTitle")
      : t("family.confirmRemoveTitle");

  const confirmDesc =
    confirmAction?.type === "leave"
      ? t("family.confirmLeaveDesc", { family: confirmAction.familyName })
      : confirmAction?.type === "remove"
        ? t("family.confirmRemoveDesc", { member: confirmAction.memberName })
        : "";

  const confirmCta =
    confirmAction?.type === "leave" ? t("family.leave") : t("family.remove");

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("nav.family")}</h1>
        <div className="flex gap-2">
          {isParent && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>{t("family.create")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("family.create")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("family.groupName")}</Label>
                    <Input
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      maxLength={32}
                    />
                  </div>
                  <Button
                    onClick={() => createFamily.mutate({ name: createName })}
                    disabled={!createName.trim() || createFamily.isPending}
                    className="w-full"
                  >
                    {createFamily.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t("common.confirm")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">{t("family.join")}</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("family.join")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {joinError && <p className="text-sm text-destructive">{joinError}</p>}
                <div className="space-y-2">
                  <Label>{t("family.inviteCode")}</Label>
                  <Input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    maxLength={6}
                    placeholder="ABC123"
                  />
                </div>
                <Button
                  onClick={() => joinFamily.mutate({ inviteCode: joinCode })}
                  disabled={joinCode.length !== 6 || joinFamily.isPending}
                  className="w-full"
                >
                  {joinFamily.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("common.confirm")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!families?.length && (
        <p className="text-muted-foreground">{t("common.noData")}</p>
      )}

      {families?.map((family) => (
        <Card key={family.id}>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <CardTitle className="text-lg truncate">{family.name}</CardTitle>
              {family.myRole === "OWNER" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground shrink-0"
                  aria-label={t("family.renameAction")}
                  onClick={() => {
                    setRenameState({ familyId: family.id, current: family.name });
                    setRenameDraft(family.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Badge variant={family.myRole === "OWNER" ? "default" : "secondary"}>
              {family.myRole === "OWNER" ? t("family.owner") : t("family.member")}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            {family.myRole === "OWNER" && family.inviteCode && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">{t("family.inviteCode")}:</span>
                <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
                  {family.inviteCode}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => refreshCode.mutate({ familyId: family.id })}
                  disabled={refreshCode.isPending}
                >
                  {refreshCode.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {t("family.invite")}
                </Button>
              </div>
            )}

            <Separator />

            <div>
              <h4 className="mb-2 text-sm font-medium">{t("family.members")}</h4>
              <div className="space-y-2">
                {family.members.map((member) => {
                  const isSelf = member.userId === session?.user?.id;
                  const canAct =
                    (family.myRole === "OWNER" && !isSelf) ||
                    (family.myRole !== "OWNER" && isSelf);

                  return (
                    <div key={member.id} className="flex items-center justify-between rounded-md border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{member.user.nickname}</span>
                        <Badge variant="outline" className="text-xs">
                          {member.user.role === "STUDENT"
                            ? t("auth.student")
                            : t("auth.parent")}
                        </Badge>
                        {member.role === "OWNER" && (
                          <Badge variant="secondary" className="text-xs">
                            {t("family.owner")}
                          </Badge>
                        )}
                      </div>
                      {canAct && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() =>
                            setConfirmAction(
                              isSelf
                                ? {
                                    type: "leave",
                                    familyId: family.id,
                                    familyName: family.name,
                                  }
                                : {
                                    type: "remove",
                                    familyId: family.id,
                                    userId: member.userId,
                                    memberName: member.user.nickname,
                                  },
                            )
                          }
                        >
                          {isSelf ? t("family.leave") : t("family.remove")}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog
        open={confirmAction !== null}
        onOpenChange={(open) => {
          if (!open && !removeMember.isPending) setConfirmAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmTitle}</DialogTitle>
            <DialogDescription>{confirmDesc}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmAction(null)}
              disabled={removeMember.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!confirmAction) return;
                const userId =
                  confirmAction.type === "leave"
                    ? session?.user?.id
                    : confirmAction.userId;
                if (!userId) return;
                removeMember.mutate({
                  familyId: confirmAction.familyId,
                  userId,
                });
              }}
              disabled={removeMember.isPending}
            >
              {removeMember.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {confirmCta}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameState !== null}
        onOpenChange={(open) => {
          if (!open && !renameFamily.isPending) {
            setRenameState(null);
            setRenameDraft("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("family.renameTitle")}</DialogTitle>
            <DialogDescription>{t("family.renameDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t("family.groupName")}</Label>
            <Input
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              maxLength={32}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenameState(null);
                setRenameDraft("");
              }}
              disabled={renameFamily.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (!renameState) return;
                const trimmed = renameDraft.trim();
                if (!trimmed || trimmed === renameState.current) {
                  setRenameState(null);
                  setRenameDraft("");
                  return;
                }
                renameFamily.mutate({
                  familyId: renameState.familyId,
                  name: trimmed,
                });
              }}
              disabled={
                renameFamily.isPending ||
                !renameDraft.trim() ||
                renameDraft.trim() === renameState?.current
              }
            >
              {renameFamily.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
