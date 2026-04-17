"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import Link from "next/link";
import { GRADES } from "@/lib/domain/validations/grade";

export default function RegisterPage() {
  const t = useTranslations();
  const router = useRouter();

  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    nickname: "",
    role: "" as "STUDENT" | "PARENT" | "",
    grade: "" as string,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: async () => {
      // Auto-login after registration
      await signIn("credentials", {
        username: form.username,
        password: form.password,
        redirect: false,
      });
      router.push("/");
      router.refresh();
    },
    onError: (error) => {
      if (error.message === "USERNAME_EXISTS") {
        setErrors({ username: t("error.usernameExists") });
      } else {
        setErrors({ form: t("error.serverError") });
      }
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};

    if (!/^[a-zA-Z0-9_]{4,32}$/.test(form.username)) {
      e.username = t("error.invalidUsername");
    }
    if (form.password.length < 8 || !/[a-zA-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      e.password = t("error.invalidPassword");
    }
    if (form.password !== form.confirmPassword) {
      e.confirmPassword = t("error.passwordMismatch");
    }
    if (!form.nickname.trim()) {
      e.nickname = t("error.required");
    }
    if (!form.role) {
      e.role = t("error.required");
    }
    if (form.role === "STUDENT" && !form.grade) {
      e.grade = t("validation.gradeRequired");
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    registerMutation.mutate({
      username: form.username,
      password: form.password,
      confirmPassword: form.confirmPassword,
      nickname: form.nickname,
      role: form.role as "STUDENT" | "PARENT",
      grade: form.role === "STUDENT" ? (form.grade as typeof GRADES[number]) : undefined,
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("auth.register")}</CardTitle>
        <CardDescription>{t("app.tagline")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {errors.form && (
            <p className="text-sm text-destructive text-center">{errors.form}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">{t("auth.username")}</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="username"
            />
            {errors.username && <p className="text-sm text-destructive">{errors.username}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
            {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              autoComplete="new-password"
            />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="nickname">{t("auth.nickname")}</Label>
            <Input
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))}
            />
            {errors.nickname && <p className="text-sm text-destructive">{errors.nickname}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t("auth.role")}</Label>
            <Select
              value={form.role}
              onValueChange={(v) => setForm((f) => ({ ...f, role: v as "STUDENT" | "PARENT", grade: "" }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="STUDENT">{t("auth.student")}</SelectItem>
                <SelectItem value="PARENT">{t("auth.parent")}</SelectItem>
              </SelectContent>
            </Select>
            {errors.role && <p className="text-sm text-destructive">{errors.role}</p>}
          </div>

          {form.role === "STUDENT" && (
            <div className="space-y-2">
              <Label>{t("auth.grade")}</Label>
              <Select
                value={form.grade}
                onValueChange={(v) => setForm((f) => ({ ...f, grade: v }))}
              >
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
              {errors.grade && <p className="text-sm text-destructive">{errors.grade}</p>}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
            {registerMutation.isPending ? t("common.loading") : t("auth.register")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("auth.hasAccount")}{" "}
            <Link href="/login" className="text-primary hover:underline">
              {t("auth.loginNow")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
