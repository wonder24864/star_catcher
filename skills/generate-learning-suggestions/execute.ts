/**
 * Skill: generate-learning-suggestions v1.0.0
 *
 * Generate personalized learning suggestions for a student.
 *
 * Flow:
 *   1. Read weak points via ctx.readMemory("getWeakPoints")
 *   2. Read mastery states for weak KPs
 *   3. Read recent intervention history
 *   4. Call LEARNING_SUGGESTION AI operation
 *   5. Return structured result (handler persists to LearningSuggestion table)
 *
 * See: US-061 (parent-analytics-phase4.md)
 */

interface WeakPoint {
  knowledgePointId: string;
  status: string;
  totalAttempts: number;
  correctAttempts: number;
}

interface MasteryStateView {
  knowledgePointId: string;
  status: string;
  totalAttempts: number;
  correctAttempts: number;
}

interface InterventionRecord {
  type: string;
  createdAt: Date | string;
  preMasteryStatus?: string | null;
  knowledgePointId: string;
}

interface KnowledgePointInfo {
  id: string;
  name: string;
  subject: string;
}

interface SuggestionItem {
  category: "review_priority" | "practice_focus" | "learning_strategy";
  title: string;
  description: string;
  relatedKnowledgePoints: string[];
  priority: "high" | "medium" | "low";
}

interface AttentionItem {
  type: "regression_risk" | "foundational_gap" | "overload_warning";
  description: string;
  actionRequired: boolean;
}

interface ParentAction {
  action: string;
  reason: string;
  frequency: "daily" | "weekly" | "as_needed";
}

interface SkillInput {
  studentId: string;
}

interface SkillOutput {
  suggestions: SuggestionItem[];
  attentionItems: AttentionItem[];
  parentActions: ParentAction[];
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

module.exports.execute = async function execute(
  input: SkillInput,
  ctx: SkillContext,
): Promise<SkillOutput> {
  const { studentId } = input;

  // 1. Read weak points
  const weakPoints = (await ctx.readMemory("getWeakPoints", {
    studentId,
  })) as WeakPoint[];

  if (!weakPoints || weakPoints.length === 0) {
    return {
      suggestions: [
        {
          category: "learning_strategy",
          title: "Keep up the good work",
          description: "No significant weak areas detected. Continue regular practice.",
          relatedKnowledgePoints: [],
          priority: "low",
        },
      ],
      attentionItems: [],
      parentActions: [],
    };
  }

  // 2. Read KP details for names
  const kpIds = weakPoints.map((wp) => wp.knowledgePointId);
  const kpInfos = (await ctx.query("findKnowledgePoints", {
    ids: kpIds,
  })) as KnowledgePointInfo[];

  const kpNameMap = new Map<string, string>();
  for (const kp of kpInfos) {
    kpNameMap.set(kp.id, kp.name);
  }

  // 3. Build mastery states with names
  const masteryStates = weakPoints.map((wp) => ({
    kpId: wp.knowledgePointId,
    kpName: kpNameMap.get(wp.knowledgePointId) ?? wp.knowledgePointId,
    status: wp.status,
    correctRate:
      wp.totalAttempts > 0 ? wp.correctAttempts / wp.totalAttempts : 0,
  }));

  // 4. Compute weak point entries with severity/trend
  const enrichedWeakPoints = weakPoints.map((wp) => {
    const errorCount = wp.totalAttempts - wp.correctAttempts;
    const correctRate =
      wp.totalAttempts > 0 ? wp.correctAttempts / wp.totalAttempts : 0;
    const severity =
      errorCount >= 5 || correctRate < 0.3
        ? "HIGH"
        : errorCount >= 3
          ? "MEDIUM"
          : "LOW";

    return {
      kpId: wp.knowledgePointId,
      kpName: kpNameMap.get(wp.knowledgePointId) ?? wp.knowledgePointId,
      severity,
      trend: "STABLE" as string,
      errorCount,
    };
  });

  // 5. Read recent intervention history for each KP (latest 5 per KP)
  const allInterventions: Array<{
    kpName: string;
    type: string;
    createdAt: string;
    preMasteryStatus: string | null;
  }> = [];

  for (const kpId of kpIds.slice(0, 10)) {
    const history = (await ctx.readMemory("getInterventionHistory", {
      studentId,
      knowledgePointId: kpId,
    })) as InterventionRecord[];

    for (const h of (history || []).slice(0, 5)) {
      allInterventions.push({
        kpName: kpNameMap.get(kpId) ?? kpId,
        type: h.type,
        createdAt:
          typeof h.createdAt === "string"
            ? h.createdAt
            : new Date(h.createdAt).toISOString(),
        preMasteryStatus: h.preMasteryStatus ?? null,
      });
    }
  }

  // 6. Call AI operation
  const result = (await ctx.callAI("LEARNING_SUGGESTION", {
    weakPoints: enrichedWeakPoints,
    masteryStates,
    interventionHistory: allInterventions,
    grade: ctx.context.grade,
    locale: ctx.context.locale,
  })) as SkillOutput;

  return {
    suggestions: result.suggestions ?? [],
    attentionItems: result.attentionItems ?? [],
    parentActions: result.parentActions ?? [],
  };
};
