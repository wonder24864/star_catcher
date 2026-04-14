/**
 * Skill: weakness-profile v1.0.0
 * Analyze student weakness patterns — pure data aggregation, no AI call.
 *
 * Flow:
 *   1. Read weak points via ctx.readMemory("getWeakPoints")
 *   2. For each KP, read intervention history to compute trend
 *   3. Classify severity based on error ratio
 *   4. Return structured WeaknessProfileData (caller decides persistence)
 */

interface WeaknessProfileInput {
  tier: "PERIODIC" | "GLOBAL";
  semesterStartDate?: string;
}

interface MasteryStateView {
  id: string;
  studentId: string;
  knowledgePointId: string;
  status: string;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: Date | null;
  masteredAt: Date | null;
  version: number;
  archived: boolean;
}

interface InterventionRecord {
  id: string;
  type: string;
  content: unknown;
  createdAt: Date;
}

interface WeakPointEntry {
  kpId: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  trend: "IMPROVING" | "STABLE" | "WORSENING";
  errorCount: number;
  lastErrorAt: Date | null;
}

interface SkillContext {
  callAI(operation: string, params: Record<string, unknown>): Promise<unknown>;
  readMemory(method: string, params: Record<string, unknown>): Promise<unknown>;
  writeMemory(method: string, params: Record<string, unknown>): Promise<void>;
  query(queryName: string, params: Record<string, unknown>): Promise<unknown>;
  config: Readonly<Record<string, unknown>>;
  context: Readonly<{
    studentId: string;
    sessionId?: string;
    traceId: string;
    locale: string;
    grade?: string;
  }>;
}

// ─── Severity Classification ─────────────────────

function classifySeverity(
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

function detectTrend(
  interventions: InterventionRecord[],
): "IMPROVING" | "STABLE" | "WORSENING" {
  if (interventions.length < 2) return "STABLE";

  // Sort by createdAt ascending
  const sorted = [...interventions].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  // Split into two halves
  const mid = Math.floor(sorted.length / 2);
  const firstHalf = sorted.slice(0, mid);
  const secondHalf = sorted.slice(mid);

  // Count error-type interventions in each half
  const errorTypes = new Set(["DIAGNOSIS", "HINT"]);
  const firstErrors = firstHalf.filter((i) => errorTypes.has(i.type)).length;
  const secondErrors = secondHalf.filter((i) => errorTypes.has(i.type)).length;

  // Normalize by half size to compare density
  const firstDensity = firstHalf.length > 0 ? firstErrors / firstHalf.length : 0;
  const secondDensity = secondHalf.length > 0 ? secondErrors / secondHalf.length : 0;

  const diff = secondDensity - firstDensity;
  if (diff > 0.15) return "WORSENING";
  if (diff < -0.15) return "IMPROVING";
  return "STABLE";
}

// ─── Main Execute ────────────────────────────────

module.exports.execute = async function execute(
  input: WeaknessProfileInput,
  ctx: SkillContext,
): Promise<unknown> {
  const studentId = ctx.context.studentId;

  // 1. Read weak points (non-archived, from Memory layer)
  const weakPoints = (await ctx.readMemory("getWeakPoints", {
    studentId,
    limit: 100,
  })) as MasteryStateView[];

  if (!weakPoints || weakPoints.length === 0) {
    return { weakPoints: [] };
  }

  // 2. For each KP, compute severity + trend
  const entries: WeakPointEntry[] = [];

  for (const wp of weakPoints) {
    // Read intervention history for trend detection
    const history = (await ctx.readMemory("getInterventionHistory", {
      studentId,
      knowledgePointId: wp.knowledgePointId,
    })) as InterventionRecord[];

    // Filter by semester boundary for PERIODIC tier
    let filteredHistory = history;
    if (input.tier === "PERIODIC" && input.semesterStartDate) {
      const semesterStart = new Date(input.semesterStartDate);
      filteredHistory = history.filter(
        (h) => new Date(h.createdAt) >= semesterStart,
      );
    }

    const severity = classifySeverity(wp.totalAttempts, wp.correctAttempts);
    const trend = detectTrend(filteredHistory);

    entries.push({
      kpId: wp.knowledgePointId,
      severity,
      trend,
      errorCount: wp.totalAttempts - wp.correctAttempts,
      lastErrorAt: wp.lastAttemptAt,
    });
  }

  // 3. Sort by severity (HIGH first), then by errorCount desc
  const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  entries.sort((a, b) => {
    const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.errorCount - a.errorCount;
  });

  return { weakPoints: entries };
};
