/**
 * Skill: extract-knowledge-points
 * Extracts structured knowledge point tree from textbook TOC via AI Harness.
 */

interface ExtractKPInput {
  tocText: string;
  bookTitle: string;
  subject: string;
  grade?: string;
  schoolLevel: string;
  locale?: string;
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

interface KnowledgePointEntry {
  name: string;
  parentName?: string;
  depth: number;
  order: number;
  difficulty?: number;
  prerequisites?: string[];
}

module.exports.execute = async function execute(
  input: ExtractKPInput,
  ctx: SkillContext,
): Promise<{ knowledgePoints: KnowledgePointEntry[] }> {
  const result = await ctx.callAI("EXTRACT_KNOWLEDGE_POINTS", {
    tocText: input.tocText,
    bookTitle: input.bookTitle,
    subject: input.subject,
    grade: input.grade,
    schoolLevel: input.schoolLevel,
    locale: input.locale ?? ctx.context.locale ?? "zh-CN",
  });

  return result as { knowledgePoints: KnowledgePointEntry[] };
};
