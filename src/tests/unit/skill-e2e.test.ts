/**
 * End-to-End Tests: Skill Build → Register → Execute Pipeline
 *
 * Verifies the complete skill lifecycle:
 *   1. Build skill from source (validate + compile)
 *   2. Register in SkillRegistry (mock DB)
 *   3. Load from registry → get schema + bundle path
 *   4. Adapt schema for provider (Schema Adapter)
 *   5. Execute via SkillRuntime (IPC sandbox)
 *   6. Verify result
 */
import { describe, test, expect, vi } from "vitest";
import path from "path";
import { buildSkill } from "@/lib/domain/skill/build";
import { adaptSchema } from "@/lib/domain/skill/schema-adapter";
import { SkillRuntime } from "@/lib/domain/skill/runtime";
import { SkillRegistry } from "@/lib/domain/skill/registry";
import { validateManifest, validateSchema } from "@/lib/domain/skill/bundle";
import type {
  SkillIPCHandlers,
  SkillExecutionContext,
} from "@/lib/domain/skill/types";
import type { OpenAIFunctionTool, AnthropicTool } from "@/lib/domain/skill/schema-adapter";

const SKILLS_DIR = path.resolve(process.cwd(), "skills");
const WORKER_PATH = path.resolve(
  process.cwd(),
  "src/lib/domain/skill/sandbox-worker.js",
);

const testContext: SkillExecutionContext = {
  studentId: "student-e2e-1",
  sessionId: "session-e2e-1",
  traceId: "trace-e2e-1",
  locale: "zh-CN",
  grade: "PRIMARY_5",
};

function createMockHandlers(): SkillIPCHandlers {
  return {
    onCallAI: vi.fn().mockResolvedValue({
      success: true,
      data: { isCorrect: false, score: 60, feedback: "Check your calculation" },
    }),
    onReadMemory: vi.fn().mockResolvedValue({
      status: "NEW_ERROR",
      totalAttempts: 1,
    }),
    onWriteMemory: vi.fn().mockResolvedValue(undefined),
  };
}

// ─── Echo Skill E2E ───────────────────────────────

describe("Echo Skill — Full Pipeline", () => {
  const skillDir = path.join(SKILLS_DIR, "echo");

  test("build: validates and compiles successfully", async () => {
    const result = await buildSkill({ skillDir });

    expect(result.success).toBe(true);
    expect(result.manifest!.name).toBe("echo");
    expect(result.manifest!.version).toBe("1.0.0");
    expect(result.schema!.name).toBe("echo");
    expect(result.outputPath).toContain("index.js");
  });

  test("schema adapter: converts for all providers", async () => {
    const result = await buildSkill({ skillDir });
    const schema = result.schema!;

    const openai = adaptSchema(schema, "openai") as OpenAIFunctionTool;
    expect(openai.type).toBe("function");
    expect(openai.function.name).toBe("echo");

    const anthropic = adaptSchema(schema, "anthropic") as AnthropicTool;
    expect(anthropic.name).toBe("echo");
    expect(anthropic.input_schema).toHaveProperty("type", "object");
  });

  test("execute: full IPC pipeline returns echoed input", async () => {
    const buildResult = await buildSkill({ skillDir });
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      buildResult.outputPath!,
      { message: "hello world" },
      testContext,
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.echoed).toEqual({ message: "hello world" });
    expect(data.studentId).toBe("student-e2e-1");
    expect(data.locale).toBe("zh-CN");

    // Echo skill should NOT call AI or memory
    expect(handlers.onCallAI).not.toHaveBeenCalled();
    expect(handlers.onReadMemory).not.toHaveBeenCalled();
    expect(handlers.onWriteMemory).not.toHaveBeenCalled();
  });
});

// ─── Harness Call Skill E2E ───────────────────────

describe("Harness Call Skill — Full Pipeline", () => {
  const skillDir = path.join(SKILLS_DIR, "harness-call");

  test("build: validates and compiles successfully", async () => {
    const result = await buildSkill({ skillDir });

    expect(result.success).toBe(true);
    expect(result.manifest!.name).toBe("harness-call");
    expect(result.schema!.name).toBe("harness_call");
  });

  test("execute: IPC → Harness → Memory chain verified", async () => {
    const buildResult = await buildSkill({ skillDir });
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      buildResult.outputPath!,
      { question: "2 + 3 = ?", studentAnswer: "6" },
      testContext,
    );

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;

    // Verify AI was called
    expect(handlers.onCallAI).toHaveBeenCalledTimes(1);
    expect(handlers.onCallAI).toHaveBeenCalledWith(
      "GRADE_ANSWER",
      expect.objectContaining({
        question: "2 + 3 = ?",
        studentAnswer: "6",
        locale: "zh-CN",
      }),
    );

    // Verify memory read
    expect(handlers.onReadMemory).toHaveBeenCalledTimes(1);
    expect(handlers.onReadMemory).toHaveBeenCalledWith(
      "getMasteryState",
      expect.objectContaining({ studentId: "student-e2e-1" }),
    );

    // Verify memory write
    expect(handlers.onWriteMemory).toHaveBeenCalledTimes(1);
    expect(handlers.onWriteMemory).toHaveBeenCalledWith(
      "logIntervention",
      expect.objectContaining({
        studentId: "student-e2e-1",
        type: "GRADING",
      }),
    );

    // Verify result contains data from all operations
    expect(data.gradeResult).toEqual({
      success: true,
      data: { isCorrect: false, score: 60, feedback: "Check your calculation" },
    });
    expect(data.memoryState).toEqual({ status: "NEW_ERROR", totalAttempts: 1 });
    expect(data.chain).toBe("IPC → Harness → Memory verified");
  });
});

// ─── Registry Integration ─────────────────────────

describe("Registry → Runtime Integration", () => {
  test("registry loads skill, runtime executes it", async () => {
    // Build the echo skill
    const buildResult = await buildSkill({
      skillDir: path.join(SKILLS_DIR, "echo"),
    });
    const fs = require("fs");
    const manifest = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, "echo", "manifest.json"), "utf-8"),
    );
    const schema = JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, "echo", "schema.json"), "utf-8"),
    );

    // Simulate registry behavior with mock DB
    const mockSkillRow = {
      id: "sk-echo-1",
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      functionSchema: schema,
      bundleUrl: buildResult.outputPath,
      config: { timeout: manifest.timeout },
      status: "ACTIVE",
      callCount: 0,
      avgDurationMs: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockDb = {
      skillDefinition: {
        findMany: vi.fn().mockResolvedValue([mockSkillRow]),
      },
    };

    const registry = new SkillRegistry(mockDb as never);

    // Load from registry
    const skill = await registry.getSkillByName("echo");
    expect(skill).not.toBeNull();
    expect(skill!.functionSchema.name).toBe("echo");

    // Adapt schema for OpenAI
    const tools = (await registry.getActiveSchemas()).map((s) =>
      adaptSchema(s, "openai"),
    );
    expect(tools).toHaveLength(1);

    // Execute via runtime
    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, {
      workerPath: WORKER_PATH,
      timeoutMs: skill!.timeout,
    });

    const execResult = await runtime.execute(
      skill!.bundleUrl!,
      { message: "registry test" },
      testContext,
    );

    expect(execResult.success).toBe(true);
    const data = execResult.data as Record<string, unknown>;
    expect(data.echoed).toEqual({ message: "registry test" });
  });
});

// ─── Diagnose Error Skill E2E ─────────────────────

describe("Diagnose Error Skill — Full Pipeline", () => {
  const skillDir = path.join(SKILLS_DIR, "diagnose-error");

  test("build + execute: calls AI and memory correctly", async () => {
    const buildResult = await buildSkill({ skillDir });
    expect(buildResult.success).toBe(true);

    const handlers = createMockHandlers();
    const runtime = new SkillRuntime(handlers, { workerPath: WORKER_PATH });

    const result = await runtime.execute(
      buildResult.outputPath!,
      {
        question: "What is 3/4 + 1/2?",
        correctAnswer: "5/4",
        studentAnswer: "4/6",
        subject: "MATH",
      },
      testContext,
    );

    expect(result.success).toBe(true);

    // Verify the full chain
    expect(handlers.onCallAI).toHaveBeenCalledWith(
      "DIAGNOSE_ERROR",
      expect.objectContaining({
        question: "What is 3/4 + 1/2?",
        subject: "MATH",
      }),
    );
    expect(handlers.onReadMemory).toHaveBeenCalled();
    expect(handlers.onWriteMemory).toHaveBeenCalledWith(
      "logIntervention",
      expect.objectContaining({
        studentId: "student-e2e-1",
        type: "DIAGNOSIS",
      }),
    );
  });
});
