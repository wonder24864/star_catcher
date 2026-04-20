/**
 * ContentGuardrail — K-12 content safety filter for AI outputs.
 *
 * Runs post-OutputValidator in the Harness pipeline.
 * Checks for inappropriate content in AI-generated text before
 * it reaches students.
 */

export interface GuardrailResult {
  safe: boolean;
  reason?: string;
}

// --- Blacklists (Chinese + English) ---

const UNSAFE_PATTERNS: RegExp[] = [
  // Violence / self-harm
  /自杀|自残|割腕|跳楼|杀人|暴力|血腥/,
  /suicide|self[- ]?harm|kill\s+(yourself|himself|herself)|murder|gore/i,

  // Sexual content
  /色情|裸体|性行为|做爱|淫秽/,
  /porn|nude|sexual\s+intercourse|obscene/i,

  // Drugs / substance abuse
  /毒品|吸毒|大麻|冰毒|海洛因/,
  /illegal\s+drugs?|cocaine|heroin|methamphetamine/i,

  // Discrimination / hate speech
  /种族歧视|性别歧视|仇恨|纳粹/,
  /racial\s+slur|hate\s+speech|nazi/i,

  // Gambling
  /赌博|赌场|下注|博彩/,
  /gambling|casino|betting/i,

  // Weapons (explicit, not physics-related)
  /制造炸弹|枪支制造|爆炸物配方/,
  /how\s+to\s+(make|build)\s+(a\s+)?bomb|weapon\s+manufacturing/i,

  // Profanity (common Chinese)
  /他妈的|操你|傻逼|狗屎|混蛋|王八蛋/,
];

/**
 * Default max length for AI output text to prevent hallucination flooding.
 * HELP_GENERATE Level 3 can be long, so we allow up to 8000 chars by default.
 * Operations whose output scales with input (OCR full page, KP tree from TOC)
 * should set `AIOperation.maxOutputLength` to override this.
 */
export const DEFAULT_MAX_OUTPUT_LENGTH = 8000;

/**
 * Check AI-generated content for K-12 safety.
 *
 * @param content - The raw AI response content (JSON string or parsed text)
 * @param maxOutputLength - Override the default length cap (per-operation)
 * @returns GuardrailResult with safe=true if content passes all checks
 */
export function checkContentSafety(
  content: string,
  maxOutputLength: number = DEFAULT_MAX_OUTPUT_LENGTH,
): GuardrailResult {
  // 1. Length check — prevent hallucination floods
  if (content.length > maxOutputLength) {
    return {
      safe: false,
      reason: `Output too long (${content.length} chars, max ${maxOutputLength})`,
    };
  }

  // 2. Extract all string values from JSON for deep inspection
  const textToCheck = extractStringsFromJson(content);

  // 3. Pattern matching against blacklists
  for (const pattern of UNSAFE_PATTERNS) {
    if (pattern.test(textToCheck)) {
      return {
        safe: false,
        reason: `Unsafe content detected: matched pattern ${pattern.source.slice(0, 30)}...`,
      };
    }
  }

  return { safe: true };
}

/**
 * Extract all string values from a JSON string for content inspection.
 * Falls back to treating the entire content as text if not valid JSON.
 */
function extractStringsFromJson(content: string): string {
  try {
    const parsed = JSON.parse(content);
    const strings: string[] = [];
    collectStrings(parsed, strings);
    return strings.join(" ");
  } catch {
    // Not JSON — check the raw content
    return content;
  }
}

function collectStrings(value: unknown, acc: string[]): void {
  if (typeof value === "string") {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, acc);
    }
  } else if (value !== null && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectStrings(v, acc);
    }
  }
}
