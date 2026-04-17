"use client";

/**
 * LiveIndicator — small pulse badge showing SSE connection status.
 * Used by the Brain monitor page (Sprint 26 D68).
 *
 * Kept in its own file so that the i18n-coverage architecture test can
 * correctly resolve the `admin.brain.live.*` namespace (the test infers the
 * namespace from the FIRST `const t = useTranslations(...)` in a file).
 */

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export function LiveIndicator({ connected }: { connected: boolean }) {
  const t = useTranslations("admin.brain.live");
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        connected
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
      )}
      aria-live="polite"
    >
      <span className="relative inline-flex h-2 w-2">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            connected ? "bg-emerald-500" : "bg-muted-foreground/50",
          )}
        />
      </span>
      <span>{connected ? t("connected") : t("disconnected")}</span>
    </div>
  );
}
