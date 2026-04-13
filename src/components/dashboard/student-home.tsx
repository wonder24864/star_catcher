"use client";

import { useTranslations } from "next-intl";
import { TodayReviews } from "@/components/dashboard/today-reviews";

export function StudentHome({ userName }: { userName?: string }) {
  const t = useTranslations();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("app.name")}</h1>
        <p className="mt-2 text-muted-foreground">
          {userName
            ? `${t("nav.home")} - ${userName}`
            : t("app.tagline")}
        </p>
      </div>

      <TodayReviews />
    </div>
  );
}
