import { createHash } from "crypto";

/**
 * Normalize content for dedup hashing.
 * Business rule (BUSINESS-RULES.md §3):
 * - Remove whitespace
 * - Normalize punctuation (fullwidth → halfwidth)
 * - Normalize numbers
 */
function normalize(content: string): string {
  return content
    .replace(/\s+/g, "") // Remove all whitespace
    .replace(/[\uff01-\uff5e]/g, (ch) => // Fullwidth → halfwidth
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
    )
    .replace(/\u3000/g, "") // Ideographic space
    .toLowerCase();
}

/**
 * Compute SHA256 content hash for dedup.
 * Used by ErrorQuestion to detect duplicate questions for the same student.
 */
export function computeContentHash(content: string): string {
  return createHash("sha256").update(normalize(content)).digest("hex");
}
