/**
 * School Level Utilities
 *
 * Maps grades to school levels and provides comparison functions
 * for grade transition logic (D20).
 */

type SchoolLevel = "PRIMARY" | "JUNIOR" | "SENIOR";

const SCHOOL_LEVEL_ORDER: Record<SchoolLevel, number> = {
  PRIMARY: 1,
  JUNIOR: 2,
  SENIOR: 3,
};

/**
 * Infer school level from grade string.
 * Grade format: "PRIMARY_1" .. "PRIMARY_6", "JUNIOR_1" .. "JUNIOR_3", "SENIOR_1" .. "SENIOR_3"
 */
export function gradeToSchoolLevel(grade: string): SchoolLevel {
  if (grade.startsWith("PRIMARY_")) return "PRIMARY";
  if (grade.startsWith("JUNIOR_")) return "JUNIOR";
  return "SENIOR";
}

/**
 * Check if school level `a` is strictly lower than `b`.
 * Used for foundational weakness detection: a KP from a lower
 * school level appearing as an error in a higher level indicates
 * a foundational gap.
 */
export function isLowerSchoolLevel(a: SchoolLevel, b: SchoolLevel): boolean {
  return SCHOOL_LEVEL_ORDER[a] < SCHOOL_LEVEL_ORDER[b];
}
