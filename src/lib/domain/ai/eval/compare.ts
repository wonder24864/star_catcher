/**
 * Deep-equal helpers for EvalRunner exact-match comparisons.
 *
 * Rules:
 * - Primitives: strict equality (===), except numbers tolerate tiny float noise
 *   via absolute epsilon 1e-9 (AI numeric outputs are integer-ish in practice;
 *   this prevents 0.30000000000000004-style surprises without accepting drift).
 * - Strings: case-insensitive trimmed equality (AI output rarely matches
 *   whitespace/casing exactly; golden dataset should prefer enum/canonical forms).
 * - Arrays: by default **order-insensitive set membership** when every element is
 *   primitive; structural equality (order-sensitive) otherwise. Toggle via opts.
 * - Objects: structural, all expected keys must match; extra actual keys allowed.
 * - null/undefined: treated equal to each other (lenient) — opt out via strictNullish.
 *
 * These choices reflect real AI-output tolerance: we want to fail on semantic
 * divergence (wrong enum, missing field) not on whitespace/case/order noise.
 */

export interface CompareOptions {
  /** Require strict null !== undefined. Default false (treated equal). */
  strictNullish?: boolean;
  /** Force array order-sensitive comparison. Default false. */
  strictArrayOrder?: boolean;
  /** Disable string trim+lowercase coercion. Default false. */
  strictString?: boolean;
}

/**
 * Compare one expected field against an actual field. Returns true if they match.
 */
export function deepEquals(
  expected: unknown,
  actual: unknown,
  opts: CompareOptions = {},
): boolean {
  if (expected === actual) return true;

  // null/undefined handling
  if (expected == null || actual == null) {
    if (opts.strictNullish) return expected === actual;
    return expected == null && actual == null;
  }

  // numeric tolerance
  if (typeof expected === "number" && typeof actual === "number") {
    if (Number.isNaN(expected) && Number.isNaN(actual)) return true;
    return Math.abs(expected - actual) < 1e-9;
  }

  // string tolerance
  if (typeof expected === "string" && typeof actual === "string") {
    if (opts.strictString) return expected === actual;
    return expected.trim().toLowerCase() === actual.trim().toLowerCase();
  }

  // arrays
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return false;
    if (opts.strictArrayOrder || expected.some((v) => typeof v === "object" && v !== null)) {
      return expected.every((v, i) => deepEquals(v, actual[i], opts));
    }
    // order-insensitive primitive array: every expected element found in actual
    const actualCopy = [...actual];
    for (const ev of expected) {
      const idx = actualCopy.findIndex((av) => deepEquals(ev, av, opts));
      if (idx < 0) return false;
      actualCopy.splice(idx, 1);
    }
    return true;
  }

  // objects (structural, expected keys required, extras in actual allowed)
  if (typeof expected === "object" && typeof actual === "object") {
    const exObj = expected as Record<string, unknown>;
    const acObj = actual as Record<string, unknown>;
    for (const key of Object.keys(exObj)) {
      if (!deepEquals(exObj[key], acObj[key], opts)) return false;
    }
    return true;
  }

  return false;
}

/**
 * Read a dot-notation path from a nested object. Returns undefined if any
 * intermediate segment is missing.
 *
 * Examples: "errorPattern" → obj.errorPattern; "schedule.intervalDays" →
 * obj.schedule?.intervalDays
 */
export function getByPath(source: unknown, path: string): unknown {
  if (source == null || typeof source !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = source;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}
