"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

export default function FamilyPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const isParent = session?.user?.role === "PARENT";

  const { data: families, refetch } = trpc.family.list.useQuery();
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
  });

  // Remove member
  const removeMember = trpc.family.removeMember.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      utils.family.list.invalidate();
    },
  });

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
            <CardTitle className="text-lg">{family.name}</CardTitle>
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
                >
                  {t("family.invite")}
                </Button>
              </div>
            )}

            <Separator />

            <div>
              <h4 className="mb-2 text-sm font-medium">{t("family.members")}</h4>
              <div className="space-y-2">
                {family.members.map((member) => (
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
                    {/* Owner can remove others; members can leave themselves */}
                    {((family.myRole === "OWNER" && member.userId !== session?.user?.id) ||
                      (family.myRole !== "OWNER" && member.userId === session?.user?.id)) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() =>
                          removeMember.mutate({
                            familyId: family.id,
                            userId: member.userId,
                          })
                        }
                      >
                        {member.userId === session?.user?.id
                          ? t("family.leave")
                          : t("family.remove")}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
