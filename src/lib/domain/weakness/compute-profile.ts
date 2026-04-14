/**
 * Weakness Profile Computation — shared pure functions for handler-side use.
 *
 * These functions compute severity and trend from MasteryState + InterventionHistory data.
 * The Skill sandbox has its own copy (execute.ts) since it can't import main-process modules.
 */

import type {
  MasteryStateView,
  InterventionRecord,
  WeakPointEntry,
  WeaknessProfileData,
  WeaknessTrend,
} from "@/lib/domain/memory/types";

// ─── Severity Classification ─────────────────────

export function classifySeverity(
  totalAttempts: number,
  correctAttempts: number,
): "HIGH" | "MEDIUM" | "LOW" {
  const errorCount = totalAttempts - correctAttempts;
  const correctRate = totalAttempts > 0 ? correctAttempts / totalAttempts : 0;

  if (errorCount >= 5 || correctRate < 0.3) return "HIGH";
  if (errorCount >= 3) return "MEDIUM";
  return "LOW";
}

// ─── Trend Detection ─────────────────────────────

const ERROR_INTERVENTION_TYPES = new Set(["DIAGNOSIS", "HINT"]);

export function detectTrend(
  interventions: InterventionRecord[],
): WeaknessTrend {
  if (interventions.length < 2) return "STABLE";

  // Sort by createdAt ascending
  const sorted = [...interventions].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  // Split into two halves
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  // Count error-type interventions in each half
  const firstErrors = firstHalf.filter((i) =>
    ERROR_INTERVENTION_TYPES.has(i.type),
  ).length;
  const secondErrors = secondHalf.filter((i) =>
    ERROR_INTERVENTION_TYPES.has(i.type),
  ).length;

  // Normalize by half size to compare density
  const firstDensity =
    firstHalf.length > 0 ? firstErrors / firstHalf.length : 0;
  const secondDensity =
    secondHalf.length > 0 ? secondErrors / secondHalf.length : 0;

  const diff = secondDensity - firstDensity;
  if (diff > 0.15) return "WORSENING";
  if (diff < -0.15) return "IMPROVING";
  return "STABLE";
}

// ─── Profile Builder ─────────────────────────────

export interface ComputeProfileInput {
  weakPoints: MasteryStateView[];
  interventionsByKP: Map<string, InterventionRecord[]>;
}

/**
 * Build a WeaknessProfileData from pre-fetched data.
 * Pure function — no DB calls.
 */
export function buildWeaknessProfile(
  input: ComputeProfileInput,
): WeaknessProfileData {
  const entries: WeakPointEntry[] = input.weakPoints.map((wp) => {
    const history = input.interventionsByKP.get(wp.knowledgePointId) ?? [];
    return {
      kpId: wp.knowledgePointId,
      severity: classifySeverity(wp.totalAttempts, wp.correctAttempts),
      trend: detectTrend(history),
      errorCount: wp.totalAttempts - wp.correctAttempts,
      lastErrorAt: wp.lastAttemptAt,
    };
  });

  // Sort by severity (HIGH first), then by errorCount desc
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  entries.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.errorCount - a.errorCount;
  });

  return { weakPoints: entries };
}
