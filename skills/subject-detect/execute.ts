/**
 * Skill: subject-detect v1.0.0
 * Detects subject from question text through the AI Harness pipeline.
 */

interface SubjectDetectInput {
  questionContent: string;
  studentAnswer?: string;
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
  input: SubjectDetectInput,
  ctx: SkillContext,
): Promise<unknown> {
  const result = await ctx.callAI("SUBJECT_DETECT", {
    questionContent: input.questionContent,
    studentAnswer: input.studentAnswer ?? "",
  });

  return result;
};
