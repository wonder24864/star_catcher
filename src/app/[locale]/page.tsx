import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations("app");

  return (
    <main className="flex flex-1 items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">{t("name")}</h1>
        <p className="mt-2 text-muted-foreground">{t("tagline")}</p>
      </div>
    </main>
  );
}
