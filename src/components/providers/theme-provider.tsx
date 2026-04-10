"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

/**
 * Maps a student's grade to a UI theme name.
 * - PRIMARY_*  → "candy"  (large font, large buttons, warm colours)
 * - JUNIOR_*   → "fresh"  (medium sizing, cooler tones)
 * - SENIOR_* / non-student → default (Pro, no data-theme attribute)
 */
function gradeToTheme(
  grade: string | null | undefined,
  role: string | null | undefined
): "candy" | "fresh" | null {
  if (role !== "STUDENT") return null;
  if (!grade) return null;
  if (grade.startsWith("PRIMARY_")) return "candy";
  if (grade.startsWith("JUNIOR_")) return "fresh";
  return null; // SENIOR_* → Pro
}

/**
 * Reads the authenticated user's grade from the session and applies the
 * matching data-theme attribute to <html>. Re-runs whenever the session changes
 * (e.g. after profile update).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const theme = gradeToTheme(session?.user?.grade, session?.user?.role);

  useEffect(() => {
    const root = document.documentElement;
    if (theme) {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  return <>{children}</>;
}
