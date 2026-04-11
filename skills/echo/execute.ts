/**
 * Skill: echo
 * Simple echo skill — returns input unchanged.
 * Used to test the complete IPC pipeline without AI calls.
 */

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
  input: Record<string, unknown>,
  ctx: SkillContext,
): Promise<unknown> {
  return {
    echoed: input,
    studentId: ctx.context.studentId,
    locale: ctx.context.locale,
  };
};
