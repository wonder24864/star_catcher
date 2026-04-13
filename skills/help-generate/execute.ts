/**
 * Skill: help-generate v1.0.0
 * Generates progressive help content through the AI Harness pipeline.
 */

interface HelpInput {
  questionContent: string;
  studentAnswer: string;
  correctAnswer?: string;
  helpLevel: string | number;
  subject?: string;
  grade?: string;
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
  input: HelpInput,
  ctx: SkillContext,
): Promise<unknown> {
  const result = await ctx.callAI("HELP_GENERATE", {
    questionContent: input.questionContent,
    studentAnswer: input.studentAnswer,
    correctAnswer: input.correctAnswer,
    helpLevel: Number(input.helpLevel),
    subject: input.subject,
    grade: input.grade ?? ctx.context.grade,
  });

  return result;
};
