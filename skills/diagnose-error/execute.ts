/**
 * Skill: diagnose-error v1.1.0
 * Diagnose student error patterns and identify knowledge point weaknesses.
 *
 * Flow:
 *   1. Enrich: resolve knowledgePointIds → full objects via ctx.query()
 *   2. Call AI to analyze the error pattern with full context
 *   3. For each diagnosed weak KP, read existing mastery state
 *   4. Log the diagnosis as an intervention in memory
 *   5. Return structured diagnosis result
 */

interface DiagnoseInput {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  subject: string;
  grade?: string;
  knowledgePointIds?: string[];
  errorHistory?: Array<{
    question: string;
    studentAnswer: string;
    knowledgePointName: string;
    createdAt: string;
  }>;
}

interface WeakKnowledgePoint {
  knowledgePointId: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  reasoning: string;
}

interface DiagnosisResult {
  errorPattern: string;
  errorDescription: string;
  weakKnowledgePoints: WeakKnowledgePoint[];
  recommendation: string;
}

interface MasteryStateView {
  id: string;
  studentId: string;
  knowledgePointId: string;
  status: string;
  totalAttempts: number;
  correctAttempts: number;
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
  input: DiagnoseInput,
  ctx: SkillContext,
): Promise<unknown> {
  // 1. Enrich: resolve knowledgePointIds → full objects via ctx.query()
  let knowledgePoints: Array<{ id: string; name: string; description?: string }> | undefined;
  if (input.knowledgePointIds?.length) {
    knowledgePoints = (await ctx.query("findKnowledgePointsByIds", {
      ids: input.knowledgePointIds,
    })) as Array<{ id: string; name: string; description?: string }>;
  }

  // 2. Call AI to analyze the error with full context
  const diagnosis = (await ctx.callAI("DIAGNOSE_ERROR", {
    question: input.question,
    correctAnswer: input.correctAnswer,
    studentAnswer: input.studentAnswer,
    subject: input.subject,
    grade: input.grade ?? ctx.context.grade,
    knowledgePoints: knowledgePoints,
    errorHistory: input.errorHistory,
    locale: ctx.context.locale,
  })) as DiagnosisResult;

  // 3. For each diagnosed weak KP, read current mastery state
  const masteryStates: Array<{
    knowledgePointId: string;
    currentStatus: string | null;
    severity: string;
  }> = [];

  if (diagnosis.weakKnowledgePoints?.length) {
    for (const weakKP of diagnosis.weakKnowledgePoints) {
      const state = (await ctx.readMemory("getMasteryState", {
        studentId: ctx.context.studentId,
        knowledgePointId: weakKP.knowledgePointId,
      })) as MasteryStateView | null;

      masteryStates.push({
        knowledgePointId: weakKP.knowledgePointId,
        currentStatus: state?.status ?? null,
        severity: weakKP.severity,
      });
    }
  }

  // 4. Log the diagnosis as an intervention
  // Use the first weak KP for the intervention record,
  // or a general entry if no specific KP identified
  if (diagnosis.weakKnowledgePoints?.length) {
    for (const weakKP of diagnosis.weakKnowledgePoints) {
      await ctx.writeMemory("logIntervention", {
        studentId: ctx.context.studentId,
        knowledgePointId: weakKP.knowledgePointId,
        type: "DIAGNOSIS",
        content: {
          errorPattern: diagnosis.errorPattern,
          errorDescription: diagnosis.errorDescription,
          severity: weakKP.severity,
          reasoning: weakKP.reasoning,
          recommendation: diagnosis.recommendation,
        },
      });
    }
  }

  // 5. Return structured result for the Agent to process
  return {
    errorPattern: diagnosis.errorPattern,
    errorDescription: diagnosis.errorDescription,
    weakKnowledgePoints: diagnosis.weakKnowledgePoints,
    recommendation: diagnosis.recommendation,
    masteryStates,
    studentId: ctx.context.studentId,
  };
};
