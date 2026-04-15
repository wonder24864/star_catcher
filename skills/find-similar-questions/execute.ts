/**
 * Skill: find-similar-questions v1.0.0
 * Retrieve similar error questions via dual-path search (KP + pgvector).
 *
 * Pure orchestration: delegates to `findSimilarQuestions` domain function
 * through the `findSimilarQuestions` IPC query.  No AI calls.
 *
 * See: docs/user-stories/similar-questions-explanation.md (US-051)
 */

interface SimilarQuestion {
  id: string;
  content: string;
  correctAnswer: string | null;
  source: "KP" | "EMBEDDING";
  similarity?: number;
}

interface FindSimilarQuestionsInput {
  errorQuestionId: string;
  knowledgePointId: string;
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

module.exports.execute = async function execute(
  input: FindSimilarQuestionsInput,
  ctx: SkillContext,
): Promise<unknown> {
  if (!input.errorQuestionId || !input.knowledgePointId) {
    return { similar: [] };
  }

  const similar = (await ctx.query("findSimilarQuestions", {
    errorQuestionId: input.errorQuestionId,
    knowledgePointId: input.knowledgePointId,
    limit: input.limit ?? 5,
  })) as SimilarQuestion[];

  return { similar };
};
