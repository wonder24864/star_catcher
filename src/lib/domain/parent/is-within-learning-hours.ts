/**
 * Parent learning-hours enforcement.
 *
 * Given the parent-configured window (HH:MM strings, e.g. "22:00"/"07:00"),
 * returns whether a given clock time falls inside the allowed window.
 *
 * Rules:
 * - Both bounds null → no restriction (always allowed).
 * - Either bound null (partial config) → no restriction (incomplete setup
 *   should not silently lock out the student; parent UI requires both).
 * - start <= end (same-day window): inclusive endpoints.
 * - start > end (overnight window, e.g. 22:00-07:00): `now >= start || now <= end`.
 *
 * Pure function, no DB/Date dependency beyond the passed `now`. Comparisons
 * happen in wall-clock minutes to avoid tz pitfalls (server timezone is used,
 * consistent with the Brain cron `0 22 * * *`).
 *
 * See: docs/user-stories/parent-learning-control.md (US-054)
 */

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export interface LearningHoursWindow {
  start: string | null;
  end: string | null;
}

/**
 * @param now - the instant to test. Uses local wall-clock hours/minutes.
 * @param window - parent-configured window; partial/null means "no restriction".
 * @returns true if `now` is within the allowed window.
 */
export function isWithinLearningHours(
  now: Date,
  window: LearningHoursWindow,
): boolean {
  const { start, end } = window;

  if (!start || !end) return true;
  if (!HH_MM.test(start) || !HH_MM.test(end)) return true;

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = toMinutes(start);
  const endMin = toMinutes(end);

  if (startMin === endMin) {
    // Zero-width window: treat as always-disallowed is too harsh;
    // treat as no-restriction (degenerate config, parent should fix).
    return true;
  }

  if (startMin < endMin) {
    return nowMin >= startMin && nowMin <= endMin;
  }

  // Overnight window (e.g., 22:00 - 07:00)
  return nowMin >= startMin || nowMin <= endMin;
}
