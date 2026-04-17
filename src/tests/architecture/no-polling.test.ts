/**
 * Architecture Guard: No Frontend Polling
 *
 * Project rule: except for backend BullMQ cron (SCHEDULE_REGISTRY), no code
 * should poll the server on a fixed interval. All "wait for change" UX must
 * use Redis pub/sub + tRPC Subscription (see onSessionJobComplete,
 * onHelpGenerated, onAgentTraceUpdate, onMasteryUpdate).
 *
 * This test fails if a new `refetchInterval: <non-zero>` slips into any
 * component or app route. `refetchInterval: false` and `refetchInterval: 0`
 * are explicitly allowed (they mean "no polling").
 */
import { describe, test, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";

function collectFiles(dir: string, exts: string[]): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectFiles(full, exts));
    } else if (exts.includes(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

// Matches `refetchInterval: <anything>` where the value is not literally
// `false` or `0` (with optional whitespace).
const POLLING_REGEX = /refetchInterval\s*:\s*([^,})\n]+)/g;
const ALLOWED_VALUES = new Set(["false", "0"]);

describe("No Frontend Polling", () => {
  test("no refetchInterval with non-zero value in components or app routes", () => {
    const roots = ["src/components", "src/app"];
    const exts = [".ts", ".tsx"];

    const violations: Array<{ file: string; line: number; value: string }> = [];

    for (const root of roots) {
      const files = collectFiles(root, exts);
      for (const file of files) {
        const content = readFileSync(file, "utf8");
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          POLLING_REGEX.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = POLLING_REGEX.exec(line)) !== null) {
            const value = match[1].trim();
            if (!ALLOWED_VALUES.has(value)) {
              violations.push({
                file: file.replace(/\\/g, "/"),
                line: i + 1,
                value,
              });
            }
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = [
        "Frontend polling is banned by project rule.",
        "Replace refetchInterval with a tRPC Subscription (Redis pub/sub).",
        "See: src/server/routers/subscription.ts for existing patterns.",
        "",
        "Violations:",
        ...violations.map(
          (v) => `  - ${v.file}:${v.line} → refetchInterval: ${v.value}`,
        ),
      ].join("\n");
      throw new Error(message);
    }

    expect(violations).toEqual([]);
  });
});
