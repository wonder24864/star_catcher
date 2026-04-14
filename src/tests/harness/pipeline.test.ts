/**
 * Integration Tests: Harness Component Pipeline
 *
 * Verifies pipeline execution order, early return on failure,
 * and error handling.
 *
 * See: docs/sprints/sprint-10a.md (Task 94)
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import type { AIProvider, AIResponse } from "@/lib/domain/ai/types";
import type { AIHarnessRequest } from "@/lib/domain/ai/harness/types";
import type { HarnessComponent, HarnessContext } from "@/lib/domain/ai/harness/component";
import { HarnessPipeline } from "@/lib/domain/ai/harness/pipeline";
import { z } from "zod";

// ── Test helpers ──

function createMockProvider(response?: Partial<AIResponse>): AIProvider {
  const defaultResponse: AIResponse = {
    content: JSON.stringify({ result: "ok" }),
    usage: { inputTokens: 10, outputTokens: 20 },
    model: "test-model",
    finishReason: "stop",
    ...response,
  };
  return {
    config: { provider: "test", model: "test-model" },
    chat: vi.fn().mockResolvedValue(defaultResponse),
    vision: vi.fn().mockResolvedValue(defaultResponse),
  };
}

function createMockRequest(overrides?: Partial<AIHarnessRequest<unknown>>): AIHarnessRequest<unknown> {
  return {
    operation: {
      name: "HELP_GENERATE",
      description: "Test operation",
      outputSchema: z.object({ result: z.string() }),
      usesVision: false,
    },
    prompt: {
      version: "1.0.0",
      build: () => [{ role: "user" as const, content: "test" }],
    },
    variables: {},
    context: { userId: "u1", locale: "zh" },
    ...overrides,
  };
}

function createTrackerComponent(name: string, order: number[]): HarnessComponent {
  return {
    name,
    execute: vi.fn(async () => { order.push(order.length); }),
  };
}

// ── Tests ──

describe("Harness Pipeline", () => {
  test("executes components in order", async () => {
    const order: number[] = [];
    const c1 = createTrackerComponent("first", order);
    const c2 = createTrackerComponent("second", order);
    const c3: HarnessComponent = {
      name: "finisher",
      execute: vi.fn(async (ctx: HarnessContext) => {
        order.push(order.length);
        ctx.succeed({ done: true });
      }),
    };
    const logger = createTrackerComponent("logger", []);

    const pipeline = new HarnessPipeline([c1, c2, c3], logger);
    const result = await pipeline.execute(createMockProvider(), createMockRequest());

    expect(result.success).toBe(true);
    expect(order).toEqual([0, 1, 2]);
    expect(c1.execute).toHaveBeenCalled();
    expect(c2.execute).toHaveBeenCalled();
    expect(c3.execute).toHaveBeenCalled();
    expect(logger.execute).toHaveBeenCalled();
  });

  test("early return when component sets completed", async () => {
    const earlyStop: HarnessComponent = {
      name: "blocker",
      execute: vi.fn(async (ctx: HarnessContext) => {
        ctx.fail("blocked", "TEST_BLOCKED", false);
      }),
    };
    const shouldNotRun: HarnessComponent = {
      name: "skipped",
      execute: vi.fn(),
    };
    const logger: HarnessComponent = {
      name: "logger",
      execute: vi.fn(),
    };

    const pipeline = new HarnessPipeline([earlyStop, shouldNotRun], logger);
    const result = await pipeline.execute(createMockProvider(), createMockRequest());

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe("TEST_BLOCKED");
    expect(shouldNotRun.execute).not.toHaveBeenCalled();
    expect(logger.execute).toHaveBeenCalled(); // Logger always runs
  });

  test("catches component exceptions and sets error result", async () => {
    const crasher: HarnessComponent = {
      name: "crasher",
      execute: vi.fn(async () => {
        throw new Error("Unexpected crash");
      }),
    };
    const logger: HarnessComponent = {
      name: "logger",
      execute: vi.fn(),
    };

    const pipeline = new HarnessPipeline([crasher], logger);
    const result = await pipeline.execute(createMockProvider(), createMockRequest());

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("Unexpected crash");
    expect(result.error?.code).toBe("AI_CALL_FAILED");
    expect(result.error?.retryable).toBe(true);
    expect(logger.execute).toHaveBeenCalled();
  });

  test("logger always runs even if component throws", async () => {
    const crasher: HarnessComponent = {
      name: "crasher",
      execute: vi.fn(async () => { throw new Error("boom"); }),
    };
    const logger: HarnessComponent = {
      name: "logger",
      execute: vi.fn(),
    };

    const pipeline = new HarnessPipeline([crasher], logger);
    await pipeline.execute(createMockProvider(), createMockRequest());

    expect(logger.execute).toHaveBeenCalledTimes(1);
  });

  test("result includes durationMs", async () => {
    const instant: HarnessComponent = {
      name: "instant",
      execute: vi.fn(async (ctx: HarnessContext) => { ctx.succeed({ fast: true }); }),
    };
    const logger: HarnessComponent = { name: "logger", execute: vi.fn() };

    const pipeline = new HarnessPipeline([instant], logger);
    const result = await pipeline.execute(createMockProvider(), createMockRequest());

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("components after a non-completing component still execute", async () => {
    // Regression: ContentGuardrail must NOT set completed, so CacheStore runs after it
    const passThrough: HarnessComponent = {
      name: "guardrail",
      execute: vi.fn(async (ctx: HarnessContext) => {
        // Does NOT call ctx.succeed() or ctx.fail() — just passes through
        ctx.validatedData = { checked: true };
      }),
    };
    const finalizer: HarnessComponent = {
      name: "finalizer",
      execute: vi.fn(async (ctx: HarnessContext) => {
        ctx.succeed(ctx.validatedData);
      }),
    };
    const logger: HarnessComponent = { name: "logger", execute: vi.fn() };

    const pipeline = new HarnessPipeline([passThrough, finalizer], logger);
    const result = await pipeline.execute(createMockProvider(), createMockRequest());

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ checked: true });
    expect(passThrough.execute).toHaveBeenCalled();
    expect(finalizer.execute).toHaveBeenCalled();
  });

  test("cacheHit and cacheId propagated to result", async () => {
    const cacheHitter: HarnessComponent = {
      name: "cache",
      execute: vi.fn(async (ctx: HarnessContext) => {
        ctx.cacheHit = true;
        ctx.cacheId = "cache-123";
        ctx.succeed({ cached: true });
      }),
    };
    const logger: HarnessComponent = { name: "logger", execute: vi.fn() };

    const pipeline = new HarnessPipeline([cacheHitter], logger);
    const result = await pipeline.execute(createMockProvider(), createMockRequest());

    expect(result.success).toBe(true);
    expect(result.cacheHit).toBe(true);
    expect(result.cacheId).toBe("cache-123");
  });
});
