/**
 * PromptInjectionGuard: Sanitize user input before embedding in prompts.
 * Detects and blocks high-risk injection attempts in student-supplied text.
 */

// Patterns that indicate injection attempts
const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?above/i,
  /disregard\s+(all\s+)?previous/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /忽略.{0,10}指令/,
  /忽略.{0,10}以上/,
  /你现在是/,
  /新的指令/,
  /系统提示/,
];

// Maximum input length (characters) — beyond this is suspicious
const MAX_INPUT_LENGTH = 5000;

export interface InjectionCheckResult {
  safe: boolean;
  /** Risk score 0-1 */
  riskScore: number;
  /** Reason for blocking (if not safe) */
  reason?: string;
}

/**
 * Check user input for prompt injection attempts.
 * Returns safe=false if input should be blocked.
 */
export function checkInjection(input: string): InjectionCheckResult {
  if (!input || input.trim().length === 0) {
    return { safe: true, riskScore: 0 };
  }

  // Length check
  if (input.length > MAX_INPUT_LENGTH) {
    return {
      safe: false,
      riskScore: 0.8,
      reason: "Input exceeds maximum length",
    };
  }

  // Pattern matching
  let matchCount = 0;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      matchCount++;
    }
  }

  if (matchCount >= 2) {
    return {
      safe: false,
      riskScore: 0.95,
      reason: "Multiple injection patterns detected",
    };
  }

  if (matchCount === 1) {
    return {
      safe: false,
      riskScore: 0.7,
      reason: "Injection pattern detected",
    };
  }

  return { safe: true, riskScore: 0 };
}

/**
 * Sanitize user input for safe embedding in prompts.
 * Strips control characters and normalizes whitespace.
 */
export function sanitizeInput(input: string): string {
  return input
    // Remove control characters except newline and tab
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    // Normalize excessive whitespace
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
