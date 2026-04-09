import type { z } from "zod";

/**
 * Validates AI output against a Zod schema.
 * Handles common AI output issues: markdown fences, trailing commas, partial JSON.
 */

/**
 * Extract JSON from AI response content.
 * Handles: raw JSON, markdown code fences, text with embedded JSON.
 */
function extractJson(content: string): string {
  let text = content.trim();

  // Remove markdown code fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // Try to find JSON object or array boundaries
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");

  if (firstBrace === -1 && firstBracket === -1) {
    return text;
  }

  const start = firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)
    ? firstBrace
    : firstBracket;

  const isObject = text[start] === "{";
  const closeChar = isObject ? "}" : "]";

  // Find matching close
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === (isObject ? "{" : "[")) depth++;
    if (text[i] === closeChar) depth--;
    if (depth === 0) {
      return text.slice(start, i + 1);
    }
  }

  // Didn't find matching close — return from start
  return text.slice(start);
}

/**
 * Fix common JSON issues in AI output.
 */
function fixCommonJsonIssues(json: string): string {
  // Remove trailing commas before } or ]
  return json.replace(/,\s*([}\]])/g, "$1");
}

/**
 * Parse and validate AI output against a Zod schema.
 * Returns the validated data or throws with details.
 */
export function validateOutput<T>(
  content: string,
  schema: z.ZodType<T>
): { success: true; data: T } | { success: false; error: string } {
  try {
    const jsonStr = extractJson(content);
    const fixed = fixCommonJsonIssues(jsonStr);
    const parsed = JSON.parse(fixed);
    const result = schema.safeParse(parsed);

    if (result.success) {
      return { success: true, data: result.data };
    }

    const errors = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { success: false, error: `Schema validation failed: ${errors}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, error: `JSON parse failed: ${msg}` };
  }
}
