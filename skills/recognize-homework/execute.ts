/**
 * Skill: recognize-homework v1.0.0
 * OCR recognition of homework images via AI Harness.
 */

interface RecognizeInput {
  imageUrls: string[];
  hasExif?: boolean;
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
  input: RecognizeInput,
  ctx: SkillContext,
): Promise<unknown> {
  const result = await ctx.callAI("OCR_RECOGNIZE", {
    imageUrls: input.imageUrls,
    hasExif: input.hasExif ?? false,
  });

  return result;
};
