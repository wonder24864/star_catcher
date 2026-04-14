/**
 * Unit Tests: Schedule Registry
 *
 * Verifies that all scheduled entries have valid cron patterns
 * and reference valid job names.
 *
 * See: docs/sprints/sprint-10a.md (Task 94)
 */
import { describe, test, expect } from "vitest";
import { SCHEDULE_REGISTRY } from "@/worker/schedule-registry";
import { JOB_HANDLERS } from "@/worker/handler-registry";

// Mock handler dependencies (needed for JOB_HANDLERS import)
import { vi } from "vitest";
vi.mock("@/worker/handlers/ocr-recognize", () => ({ handleOcrRecognize: vi.fn() }));
vi.mock("@/worker/handlers/correction-photos", () => ({ handleCorrectionPhotos: vi.fn() }));
vi.mock("@/worker/handlers/help-generate", () => ({ handleHelpGenerate: vi.fn() }));
vi.mock("@/worker/handlers/kg-import", () => ({ handleKGImport: vi.fn() }));
vi.mock("@/worker/handlers/question-understanding", () => ({ handleQuestionUnderstanding: vi.fn() }));
vi.mock("@/worker/handlers/diagnosis", () => ({ handleDiagnosis: vi.fn() }));

/** Validate a 5-field cron expression */
function isValidCron(pattern: string): boolean {
  const fields = pattern.split(" ");
  if (fields.length !== 5) return false;
  // Basic validation: each field is a number, *, or cron expression
  const fieldPattern = /^(\*|[0-9]+|[0-9]+-[0-9]+|[0-9]+\/[0-9]+|\*\/[0-9]+)(,(\*|[0-9]+|[0-9]+-[0-9]+))*$/;
  return fields.every((f) => fieldPattern.test(f));
}

describe("Schedule Registry", () => {
  test("has at least one entry", () => {
    expect(SCHEDULE_REGISTRY.length).toBeGreaterThan(0);
  });

  test("all entries have unique keys", () => {
    const keys = SCHEDULE_REGISTRY.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("all entries have valid cron patterns", () => {
    for (const entry of SCHEDULE_REGISTRY) {
      expect(isValidCron(entry.pattern), `Invalid cron for ${entry.key}: ${entry.pattern}`).toBe(true);
    }
  });

  test("all entries reference registered job handlers", () => {
    for (const entry of SCHEDULE_REGISTRY) {
      expect(
        JOB_HANDLERS[entry.jobName],
        `Schedule ${entry.key} references unregistered handler: ${entry.jobName}`,
      ).toBeDefined();
    }
  });

  test("all entries have non-empty descriptions", () => {
    for (const entry of SCHEDULE_REGISTRY) {
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  test("learning-brain is scheduled daily", () => {
    const brain = SCHEDULE_REGISTRY.find((e) => e.key === "learning-brain-daily");
    expect(brain).toBeDefined();
    expect(brain!.pattern).toBe("0 6 * * *");
    expect(brain!.jobName).toBe("learning-brain");
  });

  test("weakness-profile is scheduled weekly", () => {
    const wp = SCHEDULE_REGISTRY.find((e) => e.key === "weakness-profile-weekly");
    expect(wp).toBeDefined();
    expect(wp!.pattern).toBe("0 3 * * 0");
    expect(wp!.jobName).toBe("weakness-profile");
  });
});
