/**
 * Skill: diagnose-error
 * Diagnose student error patterns and identify knowledge point weaknesses.
 *
 * Flow:
 *   1. Call AI to analyze the error pattern
 *   2. Read existing mastery state from memory
 *   3. Write updated diagnosis to memory
 *   4. Return structured diagnosis
 */

interface DiagnoseInput {
  question: string;
  correctAnswer: string;
  studentAnswer: string;
  subject: string;
}

interface SkillContext {
  callAI(operation: string, params: Record<string, unknown>): Promise<unknown>;
  readMemory(method: string, params: Record<string, unknown>): Promise<unknown>;
  writeMemory(method: string, params: Record<string, unknown>): Promise<void>;
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
  // 1. Call AI to analyze the error
  const diagnosis = await ctx.callAI("DIAGNOSE_ERROR", {
    question: input.question,
    correctAnswer: input.correctAnswer,
    studentAnswer: input.studentAnswer,
    subject: input.subject,
    locale: ctx.context.locale,
    grade: ctx.context.grade,
  });

  // 2. Read current mastery state (if exists)
  const currentState = await ctx.readMemory("getMasteryState", {
    studentId: ctx.context.studentId,
    // knowledgePointId would come from AI diagnosis
  });

  // 3. Log the diagnosis as an intervention
  await ctx.writeMemory("logIntervention", {
    studentId: ctx.context.studentId,
    type: "DIAGNOSIS",
    content: diagnosis,
  });

  return {
    diagnosis,
    currentState,
    studentId: ctx.context.studentId,
  };
};
