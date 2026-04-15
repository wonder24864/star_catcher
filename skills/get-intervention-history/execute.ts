/**
 * Skill: get-intervention-history v1.0.0
 *
 * Thin Memory proxy: fetches the full InterventionHistory for a student + KP.
 * The mastery-evaluation handler preloads the 5 most recent records, so this
 * Skill is the "optional deeper look" escape hatch.
 */

interface GetInterventionHistoryInput {
  knowledgePointId: string;
}

type GIHInterventionRecord = {
  readonly id: string;
  readonly studentId: string;
  readonly knowledgePointId: string;
  readonly type: string;
  readonly content: unknown;
  readonly createdAt: string;
};

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
  input: GetInterventionHistoryInput,
  ctx: SkillContext,
): Promise<{ records: GIHInterventionRecord[] }> {
  const records = (await ctx.readMemory("getInterventionHistory", {
    studentId: ctx.context.studentId,
    knowledgePointId: input.knowledgePointId,
  })) as GIHInterventionRecord[];

  return { records: records ?? [] };
};
