"use client";

import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";

export default function HomePage() {
  const t = useTranslations();
  const { data: session } = useSession();

  return (
    <div>
      <h1 className="text-2xl font-bold">
        {t("app.name")}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {session?.user?.name
          ? `${t("nav.home")} - ${session.user.name}`
          : t("app.tagline")}
      </p>
    </div>
  );
}
