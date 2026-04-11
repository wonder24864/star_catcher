/**
 * Integration Tests: Agent Runner
 *
 * Verifies the Agent Runner function-calling loop:
 *   - Multi-step loop (≥ 3 steps) with mock provider + skill execution
 *   - maxSteps termination
 *   - maxTokens termination
 *   - Natural completion (AI stops calling tools)
 *   - Skill failure handling (SKILL_ALL_FAILED)
 *   - Unknown skill handling
 *   - Malformed arguments handling
 *
 * Uses a mock FunctionCallingProvider to simulate AI responses
 * and a mock SkillRuntime to avoid real worker_threads.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { AgentRunner } from "@/lib/domain/agent/runner";
import { SkillRegistry } from "@/lib/domain/skill/registry";
import type { CachedSkill } from "@/lib/domain/skill/registry";
import type { SkillRuntime } from "@/lib/domain/skill/runtime";
import type { SkillExecutionResult } from "@/lib/domain/skill/types";
import type {
  AgentDefinition,
  AgentRunContext,
  FunctionCallingProvider,
  FunctionCallingProviderMessage,
  FunctionCallingResponse,
  FunctionCallRequest,
} from "@/lib/domain/agent/types";

// ─── Test Fixtures ───────────────────────────────

const testContext: AgentRunContext = {
  userId: "user-test-1",
  studentId: "student-test-1",
  sessionId: "session-test-1",
  traceId: "trace-test-1",
  locale: "zh-CN",
  grade: "PRIMARY_5",
  correlationId: "corr-test-1",
};

function createTestDefinition(
  overrides?: Partial<AgentDefinition>,
): AgentDefinition {
  return {
    name: "test-agent",
    systemPrompt: "You are a homework analysis assistant.",
    allowedSkills: ["analyze-question", "check-knowledge", "generate-hint"],
    termination: {
      maxSteps: 10,
      maxTokens: 50000,
      stopCriteria: "Stop when you have analyzed all questions.",
    },
    ...overrides,
  };
}

/** Canonical schemas for test skills */
const testSkills: CachedSkill[] = [
  {
    id: "skill-1",
    name: "analyze-question",
    version: "1.0.0",
    description: "Analyze a homework question",
    functionSchema: {
      name: "analyze_question",
      description: "Analyze a homework question for correctness",
      parameters: {
        type: "object" as const,
        properties: {
          question_text: { type: "string", description: "The question text" },
          student_answer: { type: "string", description: "Student answer" },
        },
        required: ["question_text", "student_answer"],
      },
    },
    bundleUrl: "/bundles/analyze-question.js",
    config: {},
    timeout: 30000,
  },
  {
    id: "skill-2",
    name: "check-knowledge",
    version: "1.0.0",
    description: "Check knowledge point mastery",
    functionSchema: {
      name: "check_knowledge",
      description: "Check student mastery of a knowledge point",
      parameters: {
        type: "object" as const,
        properties: {
          knowledge_point: {
            type: "string",
            description: "Knowledge point ID",
          },
          student_id: { type: "string", description: "Student ID" },
        },
        required: ["knowledge_point"],
      },
    },
    bundleUrl: "/bundles/check-knowledge.js",
    config: {},
    timeout: 30000,
  },
  {
    id: "skill-3",
    name: "generate-hint",
    version: "1.0.0",
    description: "Generate a progressive hint",
    functionSchema: {
      name: "generate_hint",
      description: "Generate a hint for the student",
      parameters: {
        type: "object" as const,
        properties: {
          question_id: { type: "string", description: "Question ID" },
          hint_level: { type: "string", description: "Hint level (1-3)" },
        },
        required: ["question_id", "hint_level"],
      },
    },
    bundleUrl: "/bundles/generate-hint.js",
    config: {},
    timeout: 30000,
  },
];

// ─── Mock Factories ──────────────────────────────

function createMockRegistry(): SkillRegistry {
  const registry = {
    getActiveSkills: vi.fn().mockResolvedValue(testSkills),
    getSkillByName: vi.fn().mockImplementation(async (name: string) => {
      return testSkills.find((s) => s.name === name) ?? null;
    }),
    getActiveSchemas: vi
      .fn()
      .mockResolvedValue(testSkills.map((s) => s.functionSchema)),
    refresh: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  } as unknown as SkillRegistry;
  return registry;
}

function createMockRuntime(
  resultFn?: (
    bundlePath: string,
    input: unknown,
  ) => SkillExecutionResult,
): SkillRuntime {
  const defaultResult: SkillExecutionResult = {
    success: true,
    data: { result: "ok" },
    durationMs: 50,
  };

  return {
    execute: vi
      .fn()
      .mockImplementation(
        async (
          bundlePath: string,
          input: unknown,
        ): Promise<SkillExecutionResult> => {
          if (resultFn) return resultFn(bundlePath, input);
          return defaultResult;
        },
      ),
  } as unknown as SkillRuntime;
}

/** Helper to create a tool call in AI response */
function toolCall(
  name: string,
  args: Record<string, unknown>,
  id?: string,
): FunctionCallRequest {
  return {
    id: id ?? `call_${name}_${Date.now()}`,
    name,
    arguments: JSON.stringify(args),
  };
}

/** Helper to create a mock AI response with tool calls */
function aiResponseWithTools(
  calls: FunctionCallRequest[],
  usage = { inputTokens: 100, outputTokens: 50 },
): FunctionCallingResponse {
  return {
    message: {
      role: "assistant",
      content: null,
      toolCalls: calls,
    },
    usage,
    model: "gpt-4o",
    finishReason: "tool_calls",
  };
}

/** Helper to create a mock AI final response (no tool calls) */
function aiResponseFinal(
  text: string,
  usage = { inputTokens: 100, outputTokens: 50 },
): FunctionCallingResponse {
  return {
    message: {
      role: "assistant",
      content: text,
    },
    usage,
    model: "gpt-4o",
    finishReason: "stop",
  };
}

function createMockProvider(
  responses: FunctionCallingResponse[],
): FunctionCallingProvider {
  let callIndex = 0;
  return {
    chatWithTools: vi.fn().mockImplementation(async () => {
      if (callIndex >= responses.length) {
        return aiResponseFinal("No more responses configured.");
      }
      return responses[callIndex++];
    }),
  };
}

function defaultBundleResolver(skill: CachedSkill): string {
  return `/mock/bundles/${skill.name}/index.js`;
}

// ─── Tests ───────────────────────────────────────

describe("AgentRunner", () => {
  let registry: SkillRegistry;
  let runtime: SkillRuntime;

  beforeEach(() => {
    registry = createMockRegistry();
    runtime = createMockRuntime();
  });

  // ── Multi-step loop (≥ 3 steps) ──

  test("completes a 3-step function calling loop successfully", async () => {
    const provider = createMockProvider([
      // Step 1: analyze question
      aiResponseWithTools([
        toolCall("analyze_question", {
          question_text: "2+3=?",
          student_answer: "6",
        }),
      ]),
      // Step 2: check knowledge
      aiResponseWithTools([
        toolCall("check_knowledge", {
          knowledge_point: "addition-basics",
          student_id: "student-test-1",
        }),
      ]),
      // Step 3: generate hint
      aiResponseWithTools([
        toolCall("generate_hint", {
          question_id: "q-001",
          hint_level: "1",
        }),
      ]),
      // Final: AI responds with summary
      aiResponseFinal(
        "The student made an error in basic addition. A level-1 hint has been provided.",
      ),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check this homework: 2+3=6",
      testContext,
    );

    expect(result.status).toBe("COMPLETED");
    expect(result.terminationReason).toBe("COMPLETED");
    expect(result.totalSteps).toBe(3);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].skillName).toBe("analyze_question");
    expect(result.steps[1].skillName).toBe("check_knowledge");
    expect(result.steps[2].skillName).toBe("generate_hint");
    expect(result.steps.every((s) => s.status === "SUCCESS")).toBe(true);
    expect(result.finalResponse).toContain("basic addition");

    // Verify provider was called 4 times (3 tool rounds + 1 final)
    expect(provider.chatWithTools).toHaveBeenCalledTimes(4);

    // Verify runtime executed 3 skills
    expect(runtime.execute).toHaveBeenCalledTimes(3);
  });

  // ── 4-step loop with parallel tool calls ──

  test("handles parallel tool calls in a single AI response", async () => {
    const provider = createMockProvider([
      // AI calls two skills in parallel
      aiResponseWithTools([
        toolCall("analyze_question", {
          question_text: "5*3=?",
          student_answer: "15",
        }, "call_1"),
        toolCall("check_knowledge", {
          knowledge_point: "multiplication-basics",
        }, "call_2"),
      ]),
      // Then one more skill
      aiResponseWithTools([
        toolCall("generate_hint", {
          question_id: "q-002",
          hint_level: "2",
        }),
      ]),
      // Final response
      aiResponseFinal("Analysis complete. The student got it right!"),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check: 5*3=15",
      testContext,
    );

    expect(result.status).toBe("COMPLETED");
    expect(result.totalSteps).toBe(3);
    // Two from first round, one from second
    expect(result.steps[0].skillName).toBe("analyze_question");
    expect(result.steps[1].skillName).toBe("check_knowledge");
    expect(result.steps[2].skillName).toBe("generate_hint");
  });

  // ── maxSteps termination ──

  test("terminates when maxSteps is reached", async () => {
    const endlessToolCalls = Array.from({ length: 15 }, (_, i) =>
      aiResponseWithTools([
        toolCall("analyze_question", {
          question_text: `q${i}`,
          student_answer: `a${i}`,
        }),
      ]),
    );

    const provider = createMockProvider(endlessToolCalls);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition({
        termination: {
          maxSteps: 3,
          maxTokens: 999999,
          stopCriteria: "Stop after analysis.",
        },
      }),
      "Analyze everything",
      testContext,
    );

    expect(result.status).toBe("TERMINATED");
    expect(result.terminationReason).toBe("MAX_STEPS");
    expect(result.totalSteps).toBe(3);
  });

  // ── maxTokens termination ──

  test("terminates when maxTokens budget is exhausted", async () => {
    const highTokenResponses = Array.from({ length: 10 }, () =>
      aiResponseWithTools(
        [
          toolCall("analyze_question", {
            question_text: "x",
            student_answer: "y",
          }),
        ],
        { inputTokens: 5000, outputTokens: 5000 },
      ),
    );

    const provider = createMockProvider(highTokenResponses);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition({
        termination: {
          maxSteps: 10,
          maxTokens: 15000, // Will be exceeded after 2nd AI call (2 * 10000)
          stopCriteria: "",
        },
      }),
      "Analyze",
      testContext,
    );

    expect(result.status).toBe("TERMINATED");
    expect(result.terminationReason).toBe("MAX_TOKENS");
    // Should have completed at least 1 step but not 10
    expect(result.totalSteps).toBeGreaterThanOrEqual(1);
    expect(result.totalSteps).toBeLessThan(10);
  });

  // ── Natural completion ──

  test("completes naturally when AI responds without tool calls", async () => {
    const provider = createMockProvider([
      aiResponseFinal("The question looks correct, no analysis needed."),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Is 2+2=4 correct?",
      testContext,
    );

    expect(result.status).toBe("COMPLETED");
    expect(result.terminationReason).toBe("COMPLETED");
    expect(result.totalSteps).toBe(0);
    expect(result.finalResponse).toContain("no analysis needed");
  });

  // ── SKILL_ALL_FAILED ──

  test("terminates with SKILL_ALL_FAILED when all tool calls fail", async () => {
    const failingRuntime = createMockRuntime(() => ({
      success: false,
      error: "Skill execution failed: timeout",
      durationMs: 30000,
      terminated: true,
      terminationReason: "timeout",
    }));

    const provider = createMockProvider([
      aiResponseWithTools([
        toolCall("analyze_question", {
          question_text: "1+1=?",
          student_answer: "3",
        }),
      ]),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime: failingRuntime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check homework",
      testContext,
    );

    expect(result.status).toBe("FAILED");
    expect(result.terminationReason).toBe("SKILL_ALL_FAILED");
    expect(result.steps[0].status).toBe("TIMEOUT");
  });

  // ── Unknown skill ──

  test("handles unknown skill gracefully (records FAILED step)", async () => {
    const provider = createMockProvider([
      aiResponseWithTools([
        toolCall("nonexistent_skill", { data: "test" }),
      ]),
      // After failure, AI gives final response
      aiResponseFinal("I could not find the required tool."),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Do something",
      testContext,
    );

    // All calls failed → SKILL_ALL_FAILED
    expect(result.status).toBe("FAILED");
    expect(result.terminationReason).toBe("SKILL_ALL_FAILED");
    expect(result.steps[0].status).toBe("FAILED");
    expect(result.steps[0].errorMessage).toContain("not found");
  });

  // ── Malformed arguments ──

  test("handles malformed JSON arguments gracefully", async () => {
    const provider = createMockProvider([
      {
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call_bad",
              name: "analyze_question",
              arguments: "not valid json {{{",
            },
          ],
        },
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "gpt-4o",
        finishReason: "tool_calls",
      },
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check homework",
      testContext,
    );

    expect(result.status).toBe("FAILED");
    expect(result.terminationReason).toBe("SKILL_ALL_FAILED");
    expect(result.steps[0].status).toBe("FAILED");
    expect(result.steps[0].errorMessage).toContain("parse");
  });

  // ── AI call error ──

  test("terminates with ERROR when AI provider throws", async () => {
    const errorProvider: FunctionCallingProvider = {
      chatWithTools: vi
        .fn()
        .mockRejectedValue(new Error("API rate limit exceeded")),
    };

    const runner = new AgentRunner({
      provider: errorProvider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check homework",
      testContext,
    );

    expect(result.status).toBe("FAILED");
    expect(result.terminationReason).toBe("ERROR");
    expect(result.finalResponse).toContain("rate limit");
  });

  // ── Schema Adapter integration ──

  test("adapts schemas for anthropic provider type", async () => {
    const provider = createMockProvider([
      aiResponseFinal("Done."),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "anthropic",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Test",
      testContext,
    );

    expect(result.status).toBe("COMPLETED");

    // Verify tools were passed to provider
    const call = (provider.chatWithTools as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const tools = call[1] as Array<{ name?: string; input_schema?: unknown }>;
    // Anthropic format: { name, description, input_schema }
    expect(tools[0]).toHaveProperty("name");
    expect(tools[0]).toHaveProperty("input_schema");
    expect(tools[0]).not.toHaveProperty("type"); // No "type: function" wrapper
  });

  // ── Token accumulation ──

  test("accumulates tokens correctly across steps", async () => {
    const provider = createMockProvider([
      aiResponseWithTools(
        [toolCall("analyze_question", { question_text: "a", student_answer: "b" })],
        { inputTokens: 200, outputTokens: 100 },
      ),
      aiResponseWithTools(
        [toolCall("check_knowledge", { knowledge_point: "kp-1" })],
        { inputTokens: 300, outputTokens: 150 },
      ),
      aiResponseFinal("Done.", { inputTokens: 150, outputTokens: 80 }),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check",
      testContext,
    );

    expect(result.totalTokens.inputTokens).toBe(200 + 300 + 150);
    expect(result.totalTokens.outputTokens).toBe(100 + 150 + 80);
  });

  // ── Conversation history integrity ──

  test("passes correct conversation history to provider on each call", async () => {
    const provider = createMockProvider([
      aiResponseWithTools([
        toolCall("analyze_question", { question_text: "1+1", student_answer: "2" }, "call_a1"),
      ]),
      aiResponseFinal("All correct!"),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    await runner.run(
      createTestDefinition(),
      "Check: 1+1=2",
      testContext,
    );

    const calls = (provider.chatWithTools as ReturnType<typeof vi.fn>).mock
      .calls;

    // First call: [system, user]
    const firstMessages = calls[0][0] as FunctionCallingProviderMessage[];
    expect(firstMessages).toHaveLength(2);
    expect(firstMessages[0].role).toBe("system");
    expect(firstMessages[1].role).toBe("user");

    // Second call: [system, user, assistant(toolCalls), tool(result)]
    const secondMessages = calls[1][0] as FunctionCallingProviderMessage[];
    expect(secondMessages).toHaveLength(4);
    expect(secondMessages[0].role).toBe("system");
    expect(secondMessages[1].role).toBe("user");
    expect(secondMessages[2].role).toBe("assistant");
    expect(secondMessages[2].toolCalls).toBeDefined();
    expect(secondMessages[3].role).toBe("tool");
    expect(secondMessages[3].toolCallId).toBe("call_a1");
  });

  // ── System prompt includes termination constraints ──

  test("system prompt includes stop criteria and max steps", async () => {
    const provider = createMockProvider([aiResponseFinal("OK")]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    await runner.run(
      createTestDefinition({
        termination: {
          maxSteps: 5,
          maxTokens: 50000,
          stopCriteria: "Stop when all questions are analyzed.",
        },
      }),
      "Start",
      testContext,
    );

    const messages = (provider.chatWithTools as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as FunctionCallingProviderMessage[];
    const systemMsg = messages[0].content!;

    expect(systemMsg).toContain("Stop when all questions are analyzed");
    expect(systemMsg).toContain("at most 5 tools");
  });

  // ── agentId injected from definition.name ──

  test("passes definition.name as agentId to SkillRuntime", async () => {
    const provider = createMockProvider([
      aiResponseWithTools([
        toolCall("analyze_question", { question_text: "x", student_answer: "y" }),
      ]),
      aiResponseFinal("Done."),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    await runner.run(
      createTestDefinition({ name: "my-homework-agent" }),
      "Check",
      { ...testContext, agentId: "should-be-overridden" },
    );

    const runtimeCall = (runtime.execute as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const execContext = runtimeCall[2] as { agentId: string };
    expect(execContext.agentId).toBe("my-homework-agent");
  });

  // ── ADR-008 absolute max steps clamping ──

  test("clamps maxSteps to ADR-008 absolute max of 10", async () => {
    // Define agent with maxSteps=20, but absolute max is 10
    const manyToolCalls = Array.from({ length: 15 }, (_, i) =>
      aiResponseWithTools([
        toolCall("analyze_question", {
          question_text: `q${i}`,
          student_answer: `a${i}`,
        }),
      ]),
    );
    const provider = createMockProvider(manyToolCalls);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition({
        termination: {
          maxSteps: 20, // Will be clamped to 10
          maxTokens: 999999,
          stopCriteria: "",
        },
      }),
      "Analyze all",
      testContext,
    );

    expect(result.status).toBe("TERMINATED");
    expect(result.terminationReason).toBe("MAX_STEPS");
    expect(result.totalSteps).toBe(10); // Clamped to 10
  });

  // ── System prompt uses effective (clamped) limit ──

  test("system prompt shows effective limit when maxSteps is clamped", async () => {
    const provider = createMockProvider([aiResponseFinal("OK")]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime,
      resolveBundlePath: defaultBundleResolver,
    });

    await runner.run(
      createTestDefinition({
        termination: {
          maxSteps: 50, // Clamped to 10
          maxTokens: 50000,
          stopCriteria: "",
        },
      }),
      "Start",
      testContext,
    );

    const messages = (provider.chatWithTools as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as FunctionCallingProviderMessage[];
    const systemMsg = messages[0].content!;
    expect(systemMsg).toContain("at most 10 tools"); // Not 50
  });

  // ── Mixed success and failure in parallel calls ──

  test("continues if at least one tool call succeeds in a batch", async () => {
    const mixedRuntime = createMockRuntime((bundlePath) => {
      if (bundlePath.includes("check-knowledge")) {
        return {
          success: false,
          error: "Knowledge service unavailable",
          durationMs: 100,
        };
      }
      return { success: true, data: { result: "analyzed" }, durationMs: 50 };
    });

    const provider = createMockProvider([
      // Parallel: one succeeds, one fails
      aiResponseWithTools([
        toolCall("analyze_question", { question_text: "a", student_answer: "b" }, "call_ok"),
        toolCall("check_knowledge", { knowledge_point: "kp" }, "call_fail"),
      ]),
      aiResponseFinal("Partial analysis done."),
    ]);

    const runner = new AgentRunner({
      provider,
      providerType: "openai",
      registry,
      runtime: mixedRuntime,
      resolveBundlePath: defaultBundleResolver,
    });

    const result = await runner.run(
      createTestDefinition(),
      "Check homework",
      testContext,
    );

    // Should continue because at least one succeeded
    expect(result.status).toBe("COMPLETED");
    expect(result.totalSteps).toBe(2);
    expect(result.steps[0].status).toBe("SUCCESS");
    expect(result.steps[1].status).toBe("FAILED");
  });
});
