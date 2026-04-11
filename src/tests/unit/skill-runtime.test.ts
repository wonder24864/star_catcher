/**
 * Unit Tests: Skill Runtime + IPC Protocol
 *
 * Tests SkillRuntime worker lifecycle, IPC message routing,
 * timeout enforcement, error handling, and sandbox context passing.
 */
import { describe, test, expect, vi } from "vitest";
import path from "path";
import { SkillRuntime } from "@/lib/domain/skill/runtime";
import type {
  SkillIPCHandlers,
  SkillExecutionContext,
} from "@/lib/domain/skill/types";

const FIXTURES = path.resolve(process.cwd(), "src/tests/fixtures/skills");
const WORKER_PATH = path.resolve(
  process.cwd(),
  "src/lib/domain/skill/sandbox-worker.js",
);

const testContext: SkillExecutionContext = {
  studentId: "student-1",
  traceId: "test-trace-1",
  locale: "zh-CN",
  grade: "5",
};

function createMockHandlers(): SkillIPCHandlers {
  return {
    onCallAI: vi
      .fn()
      .mockResolvedValue({ success: true, data: { answer: 42 } }),
    onReadMemory: vi
      .fn()
      .mockResolvedValue({ status: "REVIEWING", totalAttempts: 3 }),
    onWriteMemory: vi.fn().mockResolvedValue(undefined),
    onQuery: vi.fn().mockResolvedValue([]),
  };
}

describe("SkillRuntime", () => {
  // ─── Basic Execution ──────────────────────────

  test("executes echo skill and returns input unchanged", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "echo-skill.js"),
      { greeting: "hello", number: 42 },
      testContext,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ greeting: "hello", number: 42 });
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.terminated).toBeUndefined();
  });

  test("passes execution context and config to skill", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const skillConfig = { threshold: 0.8, maxRetries: 3 };
    const result = await runtime.execute(
      path.join(FIXTURES, "context-skill.js"),
      { test: true },
      testContext,
      skillConfig,
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.studentId).toBe("student-1");
    expect(data.locale).toBe("zh-CN");
    expect(data.traceId).toBe("test-trace-1");
    expect(data.config).toEqual(skillConfig);
    expect(data.receivedInput).toEqual({ test: true });
  });

  // ─── IPC: harness.call ────────────────────────

  test("routes callAI through IPC to handler", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "ai-call-skill.js"),
      { question: "1+1=?" },
      testContext,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ success: true, data: { answer: 42 } });
    expect(handlers.onCallAI).toHaveBeenCalledTimes(1);
    expect(handlers.onCallAI).toHaveBeenCalledWith(
      "GRADE_ANSWER",
      expect.objectContaining({ question: "1+1=?" }),
    );
  });

  // ─── IPC: memory.read / memory.write ──────────

  test("routes readMemory and writeMemory through IPC", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "memory-skill.js"),
      { knowledgePointId: "kp-math-fractions" },
      testContext,
    );

    expect(result.success).toBe(true);

    // Verify writeMemory was called
    expect(handlers.onWriteMemory).toHaveBeenCalledTimes(1);
    expect(handlers.onWriteMemory).toHaveBeenCalledWith(
      "updateMasteryState",
      expect.objectContaining({
        studentId: "student-1",
        knowledgePointId: "kp-math-fractions",
        transition: "CORRECTED",
      }),
    );

    // Verify readMemory was called
    expect(handlers.onReadMemory).toHaveBeenCalledTimes(1);
    expect(handlers.onReadMemory).toHaveBeenCalledWith(
      "getMasteryState",
      expect.objectContaining({
        studentId: "student-1",
        knowledgePointId: "kp-math-fractions",
      }),
    );

    // Verify result contains data from both operations
    const data = result.data as Record<string, unknown>;
    expect(data.wrote).toBe(true);
    expect(data.state).toEqual({ status: "REVIEWING", totalAttempts: 3 });
  });

  // ─── IPC Error Handling ───────────────────────

  test("propagates IPC handler errors to skill", async () => {
    const handlers = createMockHandlers();
    handlers.onCallAI = vi
      .fn()
      .mockRejectedValue(new Error("Harness rate limit exceeded"));

    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "ai-call-skill.js"),
      { question: "test" },
      testContext,
    );

    // The skill receives the IPC error and re-throws it
    expect(result.success).toBe(false);
    expect(result.error).toContain("Harness rate limit exceeded");
  });

  // ─── Timeout Enforcement ──────────────────────

  test("terminates worker on timeout", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, {
      workerPath: WORKER_PATH,
      timeoutMs: 300,
    });

    const result = await runtime.execute(
      path.join(FIXTURES, "slow-skill.js"),
      {},
      testContext,
    );

    expect(result.success).toBe(false);
    expect(result.terminated).toBe(true);
    expect(result.terminationReason).toBe("timeout");
    expect(result.error).toContain("timed out");
    expect(result.durationMs).toBeGreaterThanOrEqual(280);
  });

  // ─── Error Handling ───────────────────────────

  test("handles skill execution errors gracefully", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "error-skill.js"),
      {},
      testContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("Skill execution failed intentionally");
    expect(result.terminated).toBeUndefined();
  });

  test("fails when bundle has no execute function", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "no-execute-skill.js"),
      {},
      testContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("does not export an execute function");
  });

  test("fails when bundle path does not exist", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      path.join(FIXTURES, "nonexistent-skill.js"),
      {},
      testContext,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  // ─── Sandbox Security (basic — detailed tests in Task 42) ──

  test("sandbox blocks require access", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    // Create a skill that tries to use require
    const fs = require("fs");
    const tempPath = path.join(FIXTURES, "_temp-require-test.js");
    fs.writeFileSync(
      tempPath,
      `module.exports.execute = async function() {
        try { var fs = require('fs'); return { blocked: false }; }
        catch(e) { return { blocked: true, error: e.message }; }
      };`,
    );

    try {
      const result = await runtime.execute(tempPath, {}, testContext);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.blocked).toBe(true);
    } finally {
      fs.unlinkSync(tempPath);
    }
  });

  test("sandbox blocks process.env access", async () => {
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const fs = require("fs");
    const tempPath = path.join(FIXTURES, "_temp-process-test.js");
    fs.writeFileSync(
      tempPath,
      `module.exports.execute = async function() {
        try { var env = process.env; return { blocked: false }; }
        catch(e) { return { blocked: true, error: e.message }; }
      };`,
    );

    try {
      const result = await runtime.execute(tempPath, {}, testContext);
      expect(result.success).toBe(true);
      const data = result.data as Record<string, unknown>;
      expect(data.blocked).toBe(true);
    } finally {
      fs.unlinkSync(tempPath);
    }
  });
});
