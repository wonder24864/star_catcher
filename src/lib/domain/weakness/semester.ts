/**
 * Semester date computation for Chinese academic calendar.
 *
 * Used by weakness-profile handler to determine the PERIODIC analysis window.
 */

/**
 * Compute semester start date based on Chinese academic calendar:
 * - Spring semester: Feb 1
 * - Fall semester: Sep 1
 */
export function computeSemesterStart(now: Date): Date {
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();

  if (month >= 1 && month < 8) {
    // Feb-Aug: spring semester started Feb 1
    return new Date(year, 1, 1);
  }

  // Sep-Jan: fall semester started Sep 1
  return month >= 8
    ? new Date(year, 8, 1)
    : new Date(year - 1, 8, 1);
}
