import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages } from "next-intl/server";
import { notFound } from "next/navigation";
import { locales } from "@/i18n/config";
import { TRPCProvider } from "@/lib/trpc/provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { GradeTierProvider } from "@/components/providers/grade-tier-provider";
import { Toaster } from "@/components/ui/sonner";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locales, locale)) notFound();

  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionProvider>
        <GradeTierProvider>
          <TRPCProvider>
            {children}
            <Toaster />
          </TRPCProvider>
        </GradeTierProvider>
      </SessionProvider>
    </NextIntlClientProvider>
  );
}
