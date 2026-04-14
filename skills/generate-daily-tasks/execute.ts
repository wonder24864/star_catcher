/**
 * Skill: generate-daily-tasks v1.0.0
 * Generate a personalized daily task plan using AI.
 *
 * Flow:
 *   1. Query existing error questions for REVIEW task candidates
 *   2. Call AI (INTERVENTION_PLAN) with weakness data + constraints
 *   3. Validate and return structured task plan (handler writes to DB)
 */

interface WeakPoint {
  kpId: string;
  kpName: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  trend: "IMPROVING" | "STABLE" | "WORSENING";
  errorCount: number;
}

interface GenerateDailyTasksInput {
  weakPoints: WeakPoint[];
  maxTasks: number;
}

interface ErrorQuestionCandidate {
  id: string;
  content: string;
  knowledgePointId: string | null;
}

interface TaskItem {
  type: "REVIEW" | "PRACTICE" | "EXPLANATION";
  knowledgePointId: string;
  questionId?: string;
  content?: Record<string, unknown>;
  sortOrder: number;
  reason: string;
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
  input: GenerateDailyTasksInput,
  ctx: SkillContext,
): Promise<unknown> {
  const { weakPoints, maxTasks } = input;
  const studentId = ctx.context.studentId;

  if (!weakPoints.length || maxTasks <= 0) {
    return { tasks: [], reasoning: "No weak points or maxTasks is zero" };
  }

  // 1. Query existing error questions for REVIEW candidates
  const kpIds = weakPoints.map((wp) => wp.kpId);
  let errorQuestions: ErrorQuestionCandidate[] = [];
  try {
    errorQuestions = (await ctx.query("getErrorQuestionsForKPs", {
      studentId,
      knowledgePointIds: kpIds,
      limit: 20,
    })) as ErrorQuestionCandidate[];
  } catch {
    // Non-fatal: proceed without REVIEW candidates
  }

  // 2. Call AI to generate the task plan
  const result = (await ctx.callAI("INTERVENTION_PLAN", {
    weakPoints,
    maxTasks,
    existingErrorQuestions: errorQuestions.filter((eq) => eq.knowledgePointId),
    grade: ctx.context.grade,
    locale: ctx.context.locale,
  })) as { tasks: TaskItem[]; reasoning: string };

  // 3. Validate: ensure all tasks reference valid KP IDs from input
  const validKPIds = new Set(kpIds);
  const validTasks = result.tasks
    .filter((t) => validKPIds.has(t.knowledgePointId))
    .slice(0, maxTasks);

  // Re-assign sortOrder to ensure contiguous 0-based ordering
  for (let i = 0; i < validTasks.length; i++) {
    validTasks[i].sortOrder = i;
  }

  return {
    tasks: validTasks,
    reasoning: result.reasoning,
  };
};
