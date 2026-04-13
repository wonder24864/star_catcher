/**
 * Skill: grade-answer v1.0.0
 * Grades a student answer through the AI Harness pipeline.
 */

interface GradeInput {
  questionContent: string;
  studentAnswer: string;
  correctAnswer?: string;
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
  input: GradeInput,
  ctx: SkillContext,
): Promise<unknown> {
  const result = await ctx.callAI("GRADE_ANSWER", {
    questionContent: input.questionContent,
    studentAnswer: input.studentAnswer,
    correctAnswer: input.correctAnswer ?? null,
    subject: input.subject,
    grade: input.grade ?? ctx.context.grade,
  });

  return result;
};
