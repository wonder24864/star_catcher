"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Shows a fixed banner at the top when the browser is offline.
 * Also used by write operations to gate network-dependent actions.
 */
export function OfflineBanner() {
  const t = useTranslations();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    // Set initial state
    setOffline(!navigator.onLine);

    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);

    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow"
    >
      <span>⚠</span>
      <span>{t("pwa.offline")}</span>
    </div>
  );
}

/**
 * Returns true when the app is offline — use in write operation guards.
 * Example:
 *   const offline = useIsOffline();
 *   if (offline) { toast.error(t("pwa.offlineWrite")); return; }
 */
export function useIsOffline(): boolean {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return offline;
}
