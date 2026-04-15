/**
 * Skill: generate-explanation-card v1.0.0
 * Generate a structured ExplanationCard for an error question.
 *
 * Flow:
 *   1. Query ErrorQuestion details (content, correctAnswer, studentAnswer, kpName, subject, grade)
 *   2. Call AI (GENERATE_EXPLANATION) with format hint (auto by default)
 *   3. Return the validated ExplanationCard
 *
 * No memory writes — caller (router or Agent handler) is responsible for any
 * persistence (e.g., lazy-caching the card into DailyTask.content).
 *
 * See: docs/user-stories/similar-questions-explanation.md (US-052)
 */

interface GenerateExplanationCardInput {
  errorQuestionId: string;
  knowledgePointId: string;
  format?: "auto" | "static" | "interactive" | "conversational";
}

interface ErrorQuestionContext {
  content: string;
  correctAnswer: string | null;
  studentAnswer: string | null;
  subject: string | null;
  grade: string | null;
  kpName: string | null;
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
  input: GenerateExplanationCardInput,
  ctx: SkillContext,
): Promise<unknown> {
  const eq = (await ctx.query("getErrorQuestionForExplanation", {
    errorQuestionId: input.errorQuestionId,
    knowledgePointId: input.knowledgePointId,
  })) as ErrorQuestionContext | null;

  if (!eq) {
    throw new Error(
      `ErrorQuestion ${input.errorQuestionId} not found or soft-deleted`,
    );
  }

  const card = await ctx.callAI("GENERATE_EXPLANATION", {
    questionContent: eq.content,
    correctAnswer: eq.correctAnswer,
    studentAnswer: eq.studentAnswer,
    kpName: eq.kpName ?? "",
    subject: eq.subject ?? undefined,
    grade: eq.grade ?? ctx.context.grade,
    format: input.format ?? "auto",
    locale: ctx.context.locale,
  });

  return { card };
};
