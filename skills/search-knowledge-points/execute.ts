/**
 * Skill: search-knowledge-points
 * Pure DB query skill — searches knowledge points by keywords.
 * Uses ctx.query() IPC method (host-side whitelist query).
 */

interface SearchKPInput {
  keywords: string[];
  subject: string;
  grade?: string;
  schoolLevel?: string;
  limit?: number;
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

interface KnowledgePointResult {
  id: string;
  name: string;
  description: string | null;
  difficulty: number;
  depth: number;
  parentName: string | null;
}

module.exports.execute = async function execute(
  input: SearchKPInput,
  ctx: SkillContext,
): Promise<{ results: KnowledgePointResult[] }> {
  const results = await ctx.query("searchKnowledgePoints", {
    keywords: input.keywords,
    subject: input.subject,
    grade: input.grade,
    schoolLevel: input.schoolLevel,
    limit: input.limit ?? 10,
  });

  return { results: results as KnowledgePointResult[] };
};
