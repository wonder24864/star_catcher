/**
 * Skill: harness-call
 * Calls AI via ctx.callAI and reads/writes memory.
 * Verifies the complete IPC → Harness → Memory chain.
 */

interface HarnessCallInput {
  question: string;
  studentAnswer: string;
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
  input: HarnessCallInput,
  ctx: SkillContext,
): Promise<unknown> {
  // 1. Call AI to grade the answer
  const gradeResult = await ctx.callAI("GRADE_ANSWER", {
    question: input.question,
    studentAnswer: input.studentAnswer,
    locale: ctx.context.locale,
  });

  // 2. Read existing memory state
  const memoryState = await ctx.readMemory("getMasteryState", {
    studentId: ctx.context.studentId,
  });

  // 3. Write result to memory
  await ctx.writeMemory("logIntervention", {
    studentId: ctx.context.studentId,
    type: "GRADING",
    content: gradeResult,
  });

  return {
    gradeResult,
    memoryState,
    chain: "IPC → Harness → Memory verified",
  };
};
