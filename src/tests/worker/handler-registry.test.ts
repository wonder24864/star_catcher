/**
 * Unit Tests: Handler Registry
 *
 * Verifies that every AIJobName has a registered handler,
 * and unknown job names throw.
 *
 * See: docs/sprints/sprint-10a.md (Task 94)
 */
import { describe, test, expect, vi } from "vitest";

// Mock all handler modules
vi.mock("@/worker/handlers/ocr-recognize", () => ({ handleOcrRecognize: vi.fn() }));
vi.mock("@/worker/handlers/correction-photos", () => ({ handleCorrectionPhotos: vi.fn() }));
vi.mock("@/worker/handlers/help-generate", () => ({ handleHelpGenerate: vi.fn() }));
vi.mock("@/worker/handlers/kg-import", () => ({ handleKGImport: vi.fn() }));
vi.mock("@/worker/handlers/question-understanding", () => ({ handleQuestionUnderstanding: vi.fn() }));
vi.mock("@/worker/handlers/diagnosis", () => ({ handleDiagnosis: vi.fn() }));
vi.mock("@/worker/handlers/learning-brain", () => ({ handleLearningBrain: vi.fn() }));

import { JOB_HANDLERS, routeJob } from "@/worker/handler-registry";
import type { AIJobName } from "@/lib/infra/queue/types";
import type { Job } from "bullmq";

const ALL_JOB_NAMES: AIJobName[] = [
  "ocr-recognize",
  "correction-photos",
  "help-generate",
  "kg-import",
  "question-understanding",
  "diagnosis",
  "learning-brain",
  "weakness-profile",
  "intervention-planning",
  "mastery-evaluation",
];

describe("Handler Registry", () => {
  test("every AIJobName has a registered handler", () => {
    for (const name of ALL_JOB_NAMES) {
      expect(JOB_HANDLERS[name], `Missing handler for ${name}`).toBeDefined();
      expect(typeof JOB_HANDLERS[name]).toBe("function");
    }
  });

  test("registry has exactly the expected number of handlers", () => {
    expect(Object.keys(JOB_HANDLERS)).toHaveLength(ALL_JOB_NAMES.length);
  });

  test("no extra handlers beyond AIJobName", () => {
    const registryKeys = Object.keys(JOB_HANDLERS);
    for (const key of registryKeys) {
      expect(ALL_JOB_NAMES).toContain(key);
    }
  });

  test("routeJob throws on unknown job name", async () => {
    const fakeJob = { name: "nonexistent", id: "1", data: {} } as Job;
    await expect(routeJob(fakeJob as never)).rejects.toThrow("Unknown job name: nonexistent");
  });

  test("Phase 3 stub handlers complete without throwing", async () => {
    const stubs: AIJobName[] = [
      "intervention-planning",
      "mastery-evaluation",
    ];

    for (const name of stubs) {
      const fakeJob = { name, id: "test-1", data: {} } as Job;
      await expect(routeJob(fakeJob as never)).resolves.toBeUndefined();
    }
  });
});
