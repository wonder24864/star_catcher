"use client";

/**
 * Drop-in replacement for useTranslations() that serves tier-specific text.
 *
 * Checks `tierText.{tier}.{namespace}.{key}` first via t.has(),
 * falls back to `{namespace}.{key}`.
 *
 * Usage:
 *   // Before:
 *   const t = useTranslations("tasks");
 *   // After (one-line change):
 *   const t = useTierTranslations("tasks");
 *   // Call-site unchanged:
 *   t("markComplete") → wonder returns "做完啦！", others return "完成"
 */

import { useTranslations } from "next-intl";
import { useTier } from "@/components/providers/grade-tier-provider";

export function useTierTranslations(namespace: string) {
  const { tier } = useTier();
  const t = useTranslations(namespace);
  const tAll = useTranslations();

  return (key: string, values?: Record<string, unknown>): string => {
    const tierKey = `tierText.${tier}.${namespace}.${key}`;
    if (tAll.has(tierKey)) {
      return tAll(tierKey as never, values as never) as string;
    }
    return t(key as never, values as never) as string;
  };
}
