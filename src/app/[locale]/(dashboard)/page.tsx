"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useStudentStore } from "@/lib/stores/student-store";
import { TodayReviews } from "@/components/dashboard/today-reviews";

export default function HomePage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const { selectedStudentId } = useStudentStore();

  const role = (session?.user as { role?: string } | undefined)?.role;
  const isStudent = role === "STUDENT";
  const isParent = role === "PARENT";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("app.name")}</h1>
        <p className="mt-2 text-muted-foreground">
          {session?.user?.name
            ? `${t("nav.home")} - ${session.user.name}`
            : t("app.tagline")}
        </p>
      </div>

      {(isStudent || isParent) && (
        <TodayReviews
          studentId={isParent ? selectedStudentId ?? undefined : undefined}
        />
      )}
    </div>
  );
}
