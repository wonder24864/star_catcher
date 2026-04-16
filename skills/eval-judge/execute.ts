/**
 * Skill: eval-judge v1.0.0 — Sprint 16 US-058.
 *
 * Thin wrapper around EVAL_JUDGE AI op. EvalRunner currently calls the
 * operation directly (not through IPC); this Skill exists so future Agents
 * can compose "judge my own output" reasoning steps via allowedSkills.
 *
 * Does NOT call readMemory / writeMemory / query — pure AI op pass-through.
 */

interface EvalJudgeInput {
  operation: string;
  operationDescription: string;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
}

interface EvalJudgeOutput {
  score: number;
  passed: boolean;
  reasoning: string;
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
  input: EvalJudgeInput,
  ctx: SkillContext,
): Promise<EvalJudgeOutput> {
  const result = (await ctx.callAI("EVAL_JUDGE", {
    operation: input.operation,
    operationDescription: input.operationDescription,
    expected: input.expected,
    actual: input.actual,
    locale: ctx.context.locale,
  })) as EvalJudgeOutput;

  return {
    score: result.score,
    passed: result.passed,
    reasoning: result.reasoning,
  };
};
