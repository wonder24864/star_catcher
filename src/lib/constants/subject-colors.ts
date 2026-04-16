/**
 * Shared subject color definitions.
 * Single source of truth — used by Recharts (HEX) and Badge components (Tailwind).
 */

export const SUBJECTS = [
  "MATH", "CHINESE", "ENGLISH", "PHYSICS", "CHEMISTRY",
  "BIOLOGY", "POLITICS", "HISTORY", "GEOGRAPHY", "OTHER",
] as const;

/** HEX colors for Recharts chart fills / strokes. */
export const SUBJECT_HEX_COLORS: Record<string, string> = {
  MATH: "#3b82f6",
  CHINESE: "#ef4444",
  ENGLISH: "#10b981",
  PHYSICS: "#f59e0b",
  CHEMISTRY: "#8b5cf6",
  BIOLOGY: "#06b6d4",
  POLITICS: "#f97316",
  HISTORY: "#84cc16",
  GEOGRAPHY: "#ec4899",
  OTHER: "#6b7280",
};

/** Tailwind classes for Badge / tag components. */
export const SUBJECT_BADGE_CLASSES: Record<string, string> = {
  MATH: "bg-blue-100 text-blue-800",
  CHINESE: "bg-red-100 text-red-800",
  ENGLISH: "bg-green-100 text-green-800",
  PHYSICS: "bg-purple-100 text-purple-800",
  CHEMISTRY: "bg-yellow-100 text-yellow-800",
  BIOLOGY: "bg-teal-100 text-teal-800",
  POLITICS: "bg-orange-100 text-orange-800",
  HISTORY: "bg-amber-100 text-amber-800",
  GEOGRAPHY: "bg-cyan-100 text-cyan-800",
  OTHER: "bg-gray-100 text-gray-800",
};
