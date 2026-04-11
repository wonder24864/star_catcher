/**
 * Skill: classify-question-knowledge
 * Uses AI to classify relevance between a question and candidate knowledge points.
 */

interface ClassifyInput {
  questionText: string;
  questionSubject: string;
  questionGrade?: string;
  candidates: Array<{
    id: string;
    name: string;
    description?: string;
  }>;
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

interface ClassifyMapping {
  knowledgePointId: string;
  confidence: number;
  reasoning: string;
}

module.exports.execute = async function execute(
  input: ClassifyInput,
  ctx: SkillContext,
): Promise<{ mappings: ClassifyMapping[] }> {
  const result = await ctx.callAI("CLASSIFY_QUESTION_KNOWLEDGE", {
    questionText: input.questionText,
    questionSubject: input.questionSubject,
    questionGrade: input.questionGrade,
    candidates: input.candidates,
    locale: ctx.context.locale,
  });

  return result as { mappings: ClassifyMapping[] };
};
