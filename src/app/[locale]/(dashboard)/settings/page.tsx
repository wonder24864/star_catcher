"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Separator } from "@/components/ui/separator";
import { GRADES } from "@/lib/domain/validations/grade";

export default function SettingsPage() {
  const t = useTranslations();
  const { data: session, update: updateSession } = useSession();
  const { data: user } = trpc.user.me.useQuery();

  const [nickname, setNickname] = useState("");
  const [grade, setGrade] = useState("");
  const [locale, setLocale] = useState("");
  const [editing, setEditing] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const utils = trpc.useUtils();

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      utils.user.me.invalidate();
      updateSession();
      setEditing(false);
    },
  });

  const changePassword = trpc.user.changePassword.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      setCurrentPassword("");
      setNewPassword("");
      setPasswordError("");
    },
    onError: (error) => {
      if (error.message === "WRONG_PASSWORD") {
        setPasswordError(t("error.loginFailed"));
      } else {
        setPasswordError(t("error.serverError"));
      }
    },
  });

  function startEdit() {
    if (!user) return;
    setNickname(user.nickname);
    setGrade(user.grade || "");
    setLocale(user.locale);
    setEditing(true);
  }

  function saveProfile() {
    const data: { nickname?: string; grade?: typeof GRADES[number]; locale?: "zh" | "en" } = {};
    if (nickname !== user?.nickname) data.nickname = nickname;
    if (grade && grade !== user?.grade) data.grade = grade as typeof GRADES[number];
    if (locale && locale !== user?.locale) data.locale = locale as "zh" | "en";
    updateProfile.mutate(data);
  }

  function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError(t("error.invalidPassword"));
      return;
    }
    changePassword.mutate({ currentPassword, newPassword });
  }

  if (!user) return null;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t("profile.title")}</h1>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t("profile.title")}</CardTitle>
          {!editing && (
            <Button variant="outline" size="sm" onClick={startEdit}>
              {t("profile.edit")}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground">{t("auth.username")}</Label>
            <p className="text-sm">{user.username}</p>
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground">{t("auth.nickname")}</Label>
            {editing ? (
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} />
            ) : (
              <p className="text-sm">{user.nickname}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-muted-foreground">{t("auth.role")}</Label>
            <p className="text-sm">
              {user.role === "STUDENT" ? t("auth.student") : t("auth.parent")}
            </p>
          </div>

          {(user.role === "STUDENT" || session?.user?.role === "STUDENT") && (
            <div className="space-y-1">
              <Label className="text-muted-foreground">{t("auth.grade")}</Label>
              {editing ? (
                <Select value={grade} onValueChange={setGrade}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GRADES.map((g) => (
                      <SelectItem key={g} value={g}>
                        {t(`grades.${g}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm">{user.grade ? t(`grades.${user.grade}`) : "-"}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-muted-foreground">{t("profile.language")}</Label>
            {editing ? (
              <Select value={locale} onValueChange={setLocale}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">{t("profile.languageNames.zh")}</SelectItem>
                  <SelectItem value="en">{t("profile.languageNames.en")}</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm">{t(`profile.languageNames.${user.locale}`)}</p>
            )}
          </div>

          {editing && (
            <div className="flex gap-2 pt-2">
              <Button onClick={saveProfile} disabled={updateProfile.isPending}>
                {t("profile.save")}
              </Button>
              <Button variant="outline" onClick={() => setEditing(false)}>
                {t("profile.cancel")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.changePassword")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            {passwordError && (
              <p className="text-sm text-destructive">{passwordError}</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t("profile.currentPassword")}</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("profile.newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={changePassword.isPending}>
              {t("common.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Parent: answer reveal strategy */}
      {session?.user?.role === "PARENT" && <ParentHelpSettings />}
    </div>
  );
}

function ParentHelpSettings() {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const { data: configs } = trpc.parent.getStudentConfigs.useQuery();
  const setLevel = trpc.parent.setMaxHelpLevel.useMutation({
    onSuccess: () => {
      toast.success(t("common.success"));
      utils.parent.getStudentConfigs.invalidate();
    },
  });

  if (!configs || configs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("parent.settings.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("parent.settings.desc")}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {configs.map((cfg) => (
          <div key={cfg.studentId} className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium">{cfg.nickname}</p>
              {cfg.grade && (
                <p className="text-xs text-muted-foreground">{t(`grades.${cfg.grade}`)}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{t("parent.settings.maxLevel")}:</span>
              <Select
                value={String(cfg.maxHelpLevel)}
                onValueChange={(v) =>
                  setLevel.mutate({ studentId: cfg.studentId, maxHelpLevel: Number(v) })
                }
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">L1 — {t("homework.help.level1")}</SelectItem>
                  <SelectItem value="2">L2 — {t("homework.help.level2")}</SelectItem>
                  <SelectItem value="3">L3 — {t("homework.help.level3")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
