/**
 * Skill: evaluate-mastery v1.0.0
 *
 * Evaluate a student's mastery of a single knowledge point. This Skill is
 * a thin wrapper over the MASTERY_EVALUATE AI operation:
 *   1. Pass through the handler-preloaded context (MasteryState, schedule,
 *      recent attempts, history, masterySpeed, currentWorkload).
 *   2. Ask the AI for a recommended transition + SM-2 adjustment.
 *   3. Return the structured suggestion. The mastery-evaluation handler
 *      validates it and writes to Memory (D17: Agent outputs advice,
 *      handler writes).
 *
 * This Skill does NOT call readMemory/writeMemory — all data flows through
 * the input payload from the handler.
 */

interface ReviewSchedule {
  intervalDays: number;
  easeFactor: number;
  consecutiveCorrect: number;
}

type EvalRecentAttempt = {
  readonly taskType: "PRACTICE" | "REVIEW" | "EXPLANATION";
  readonly isCorrect: boolean;
  readonly completedAt: string;
  readonly content?: unknown;
};

type EvalInterventionRecord = {
  readonly type: string;
  readonly createdAt: string;
  readonly content?: unknown;
};

interface EvaluateMasteryInput {
  knowledgePointId: string;
  kpName: string;
  currentMasteryStatus:
    | "NEW_ERROR"
    | "CORRECTED"
    | "REVIEWING"
    | "MASTERED"
    | "REGRESSED";
  reviewSchedule: ReviewSchedule;
  recentAttempts: EvalRecentAttempt[];
  interventionHistory: EvalInterventionRecord[];
  masterySpeed: number;
  currentWorkload: number;
  examProximityDays?: number;
}

interface EvaluateMasteryOutput {
  recommendedTransition: {
    from: string;
    to: string;
    reason: string;
  } | null;
  sm2Adjustment: {
    errorType: "calculation" | "concept" | "careless" | "method";
    intervalMultiplier: number;
  } | null;
  summary: string;
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
  input: EvaluateMasteryInput,
  ctx: SkillContext,
): Promise<EvaluateMasteryOutput> {
  const result = (await ctx.callAI("MASTERY_EVALUATE", {
    knowledgePointId: input.knowledgePointId,
    kpName: input.kpName,
    currentMasteryStatus: input.currentMasteryStatus,
    reviewSchedule: input.reviewSchedule,
    recentAttempts: input.recentAttempts,
    interventionHistory: input.interventionHistory,
    masterySpeed: input.masterySpeed,
    currentWorkload: input.currentWorkload,
    examProximityDays: input.examProximityDays,
    locale: ctx.context.locale,
  })) as EvaluateMasteryOutput;

  return {
    recommendedTransition: result.recommendedTransition ?? null,
    sm2Adjustment: result.sm2Adjustment ?? null,
    summary: result.summary,
  };
};
