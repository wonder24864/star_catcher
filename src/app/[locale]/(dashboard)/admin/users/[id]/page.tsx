"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AdminUserDetailPage() {
  const t = useTranslations();
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;

  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: user, isLoading, refetch } = trpc.admin.getUser.useQuery({ userId });

  const toggleMutation = trpc.admin.toggleUser.useMutation({
    onSuccess: () => refetch(),
  });

  const resetMutation = trpc.admin.resetPassword.useMutation({
    onSuccess: (data) => setTempPassword(data.tempPassword),
  });

  function copyPassword() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (isLoading) {
    return <p className="text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!user) {
    return <p className="text-muted-foreground">{t("common.noData")}</p>;
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          ← {t("common.back")}
        </Button>
        <h1 className="text-2xl font-bold">{t("admin.users.detail")}</h1>
      </div>

      {/* Profile card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            {user.nickname}
            <Badge variant="secondary">{t(`admin.users.roles.${user.role}`)}</Badge>
            {user.isActive ? (
              <Badge variant="default" className="bg-green-500">
                {t("admin.users.active")}
              </Badge>
            ) : (
              <Badge variant="destructive">{t("admin.users.disabled")}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-y-2">
            <span className="text-muted-foreground">ID</span>
            <span className="font-mono text-xs">{user.id}</span>

            <span className="text-muted-foreground">
              {t("auth.username")}
            </span>
            <span>@{user.username}</span>

            <span className="text-muted-foreground">{t("auth.role")}</span>
            <span>{t(`admin.users.roles.${user.role}`)}</span>

            {user.grade && (
              <>
                <span className="text-muted-foreground">{t("auth.grade")}</span>
                <span>{t(`grades.${user.grade}`)}</span>
              </>
            )}

            <span className="text-muted-foreground">
              {t("admin.users.createdAt")}
            </span>
            <span>
              {new Date(user.createdAt).toLocaleString("zh-CN")}
            </span>

            <span className="text-muted-foreground">
              {t("admin.users.loginFailCount")}
            </span>
            <span>{user.loginFailCount}</span>

            {user.lockedUntil && (
              <>
                <span className="text-muted-foreground">
                  {t("admin.users.lockedUntil")}
                </span>
                <span>{new Date(user.lockedUntil).toLocaleString("zh-CN")}</span>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stats card */}
      <Card>
        <CardContent className="flex gap-6 p-4 text-sm">
          <div className="text-center">
            <p className="text-2xl font-bold">{user.sessionCount}</p>
            <p className="text-muted-foreground">
              {t("admin.users.sessionCount")}
            </p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{user.errorCount}</p>
            <p className="text-muted-foreground">
              {t("admin.users.errorCount")}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Families card */}
      {user.familyMemberships.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("admin.users.families")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {user.familyMemberships.map((m) => (
              <div key={m.family.id} className="flex items-center gap-2">
                <span className="font-medium">{m.family.name}</span>
                <Badge variant="outline" className="text-xs">
                  {m.role === "OWNER" ? t("family.owner") : t("family.member")}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Temp password reveal */}
      {tempPassword && (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-sm text-amber-700 dark:text-amber-400">
              {t("admin.users.newTempPassword")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-3">
            <code className="rounded bg-white px-3 py-1 font-mono text-lg dark:bg-black">
              {tempPassword}
            </code>
            <Button variant="outline" size="sm" onClick={copyPassword}>
              {copied ? t("admin.users.copied") : t("admin.users.copyPassword")}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          disabled={toggleMutation.isPending}
          onClick={() => {
            const msg = user.isActive
              ? t("admin.users.confirmDisable", { name: user.nickname })
              : t("admin.users.confirmEnable", { name: user.nickname });
            if (confirm(msg)) {
              toggleMutation.mutate({ userId: user.id, isActive: !user.isActive });
            }
          }}
        >
          {user.isActive ? t("admin.users.disable") : t("admin.users.enable")}
        </Button>

        <Button
          variant="outline"
          disabled={resetMutation.isPending}
          onClick={() => {
            if (
              confirm(
                t("admin.users.resetPasswordDesc", { name: user.nickname })
              )
            ) {
              resetMutation.mutate({ userId: user.id });
            }
          }}
        >
          {t("admin.users.resetPassword")}
        </Button>
      </div>
    </div>
  );
}
