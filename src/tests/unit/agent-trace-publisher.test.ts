/**
 * Unit Tests: AgentTracePublisher
 *
 * Verifies:
 *   - Channel naming convention
 *   - Step started / step completed / trace completed event structure
 *   - Redis Pub/Sub integration (subscribeToAgentTrace yields events)
 *   - Auto-close after trace:completed
 *   - Abort signal cleanup
 *
 * Uses ioredis mock via vi.mock to avoid real Redis connections.
 *
 * See: docs/adr/008-agent-architecture.md #6
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  AgentTracePublisher,
  agentTraceChannel,
  subscribeToAgentTrace,
  type AgentTraceEvent,
  type AgentTraceStepEvent,
  type AgentTraceCompleteEvent,
} from "@/lib/domain/agent/trace-publisher";

// ─── Mock Redis ───────────────────────────────────
// We intercept Redis to capture published messages and simulate subscription.
// The subscriber's `on("message", handler)` registers into `messageHandlers`;
// the publisher's `publish(ch, msg)` dispatches to those handlers synchronously.

type MessageHandler = (channel: string, message: string) => void;

const publishedMessages: { channel: string; message: string }[] = [];
let subscribedChannels: string[] = [];
let messageHandlers: MessageHandler[] = [];

const mockRedisPublish = vi.fn(async (channel: string, message: string) => {
  publishedMessages.push({ channel, message });
  // Simulate Pub/Sub: deliver to all active subscribers on that channel
  for (const handler of messageHandlers) {
    handler(channel, message);
  }
  return 1;
});

const mockRedisSubscribe = vi.fn(async (channel: string) => {
  subscribedChannels.push(channel);
});

const mockRedisUnsubscribe = vi.fn(async () => {});
const mockRedisQuit = vi.fn(async () => {});
const mockRedisDisconnect = vi.fn();

vi.mock("ioredis", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      publish: mockRedisPublish,
      subscribe: mockRedisSubscribe,
      unsubscribe: mockRedisUnsubscribe,
      quit: mockRedisQuit,
      disconnect: mockRedisDisconnect,
      on: vi.fn((event: string, handler: MessageHandler) => {
        if (event === "message") {
          messageHandlers.push(handler);
        }
      }),
      off: vi.fn((event: string, handler: MessageHandler) => {
        if (event === "message") {
          messageHandlers = messageHandlers.filter((h) => h !== handler);
        }
      }),
    })),
  };
});

// ─── Helpers ──────────────────────────────────────

/** Wait until the mock subscribe has been called (generator is ready). */
async function waitForSubscription(expectedCount: number): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (mockRedisSubscribe.mock.calls.length >= expectedCount) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("Timed out waiting for Redis subscribe");
}

// ─── Setup ────────────────────────────────────────

beforeEach(() => {
  publishedMessages.length = 0;
  subscribedChannels = [];
  messageHandlers = [];
  vi.clearAllMocks();
});

// ─── Channel Naming ───────────────────────────────

describe("agentTraceChannel", () => {
  test("generates correct channel name", () => {
    expect(agentTraceChannel("trace-abc-123")).toBe(
      "agent:trace:trace-abc-123",
    );
  });

  test("handles different trace IDs", () => {
    expect(agentTraceChannel("t1")).toBe("agent:trace:t1");
    expect(agentTraceChannel("cluid_xyz")).toBe("agent:trace:cluid_xyz");
  });
});

// ─── Publisher Events ─────────────────────────────

describe("AgentTracePublisher", () => {
  test("publishStepStarted sends step:started event", async () => {
    const publisher = new AgentTracePublisher("trace-1");

    await publisher.publishStepStarted(1, "analyze_question");

    expect(publishedMessages).toHaveLength(1);
    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceStepEvent;
    expect(parsed).toEqual({
      type: "step:started",
      traceId: "trace-1",
      stepNo: 1,
      skillName: "analyze_question",
    });
    expect(publishedMessages[0].channel).toBe("agent:trace:trace-1");
  });

  test("publishStepCompleted sends step:completed event with SUCCESS", async () => {
    const publisher = new AgentTracePublisher("trace-2");

    await publisher.publishStepCompleted(
      2,
      "check_knowledge",
      "SUCCESS",
      150,
    );

    expect(publishedMessages).toHaveLength(1);
    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceStepEvent;
    expect(parsed).toEqual({
      type: "step:completed",
      traceId: "trace-2",
      stepNo: 2,
      skillName: "check_knowledge",
      status: "SUCCESS",
      durationMs: 150,
    });
  });

  test("publishStepCompleted includes errorMessage on FAILED", async () => {
    const publisher = new AgentTracePublisher("trace-3");

    await publisher.publishStepCompleted(
      1,
      "generate_hint",
      "FAILED",
      30000,
      "Skill execution timeout",
    );

    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceStepEvent;
    expect(parsed.status).toBe("FAILED");
    expect(parsed.errorMessage).toBe("Skill execution timeout");
    expect(parsed.durationMs).toBe(30000);
  });

  test("publishStepCompleted includes errorMessage on TIMEOUT", async () => {
    const publisher = new AgentTracePublisher("trace-4");

    await publisher.publishStepCompleted(
      3,
      "analyze_question",
      "TIMEOUT",
      30000,
      "Worker thread exceeded 30s limit",
    );

    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceStepEvent;
    expect(parsed.status).toBe("TIMEOUT");
    expect(parsed.errorMessage).toBe("Worker thread exceeded 30s limit");
  });

  test("publishTraceCompleted sends trace:completed event", async () => {
    const publisher = new AgentTracePublisher("trace-5");

    await publisher.publishTraceCompleted(
      "COMPLETED",
      "COMPLETED",
      3,
      2500,
      "Analyzed 3 knowledge points, found 2 weak areas.",
    );

    expect(publishedMessages).toHaveLength(1);
    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceCompleteEvent;
    expect(parsed).toEqual({
      type: "trace:completed",
      traceId: "trace-5",
      status: "COMPLETED",
      terminationReason: "COMPLETED",
      totalSteps: 3,
      totalDurationMs: 2500,
      summary: "Analyzed 3 knowledge points, found 2 weak areas.",
    });
  });

  test("publishTraceCompleted works with TERMINATED status", async () => {
    const publisher = new AgentTracePublisher("trace-6");

    await publisher.publishTraceCompleted(
      "TERMINATED",
      "MAX_STEPS",
      10,
      5000,
    );

    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceCompleteEvent;
    expect(parsed.status).toBe("TERMINATED");
    expect(parsed.terminationReason).toBe("MAX_STEPS");
    expect(parsed.summary).toBeUndefined();
  });

  test("publishTraceCompleted works with FAILED status", async () => {
    const publisher = new AgentTracePublisher("trace-7");

    await publisher.publishTraceCompleted(
      "FAILED",
      "SKILL_ALL_FAILED",
      1,
      100,
    );

    const parsed = JSON.parse(
      publishedMessages[0].message,
    ) as AgentTraceCompleteEvent;
    expect(parsed.status).toBe("FAILED");
    expect(parsed.terminationReason).toBe("SKILL_ALL_FAILED");
  });

  test("publishes to correct Redis channel", async () => {
    const publisher = new AgentTracePublisher("my-trace");

    await publisher.publishStepStarted(1, "some-skill");

    expect(mockRedisPublish).toHaveBeenCalledWith(
      "agent:trace:my-trace",
      expect.any(String),
    );
  });

  test("multiple events are published in order", async () => {
    const publisher = new AgentTracePublisher("trace-multi");

    await publisher.publishStepStarted(1, "analyze_question");
    await publisher.publishStepCompleted(1, "analyze_question", "SUCCESS", 100);
    await publisher.publishStepStarted(2, "check_knowledge");
    await publisher.publishStepCompleted(2, "check_knowledge", "SUCCESS", 200);
    await publisher.publishTraceCompleted("COMPLETED", "COMPLETED", 2, 300);

    expect(publishedMessages).toHaveLength(5);
    const types = publishedMessages.map(
      (m) => (JSON.parse(m.message) as AgentTraceEvent).type,
    );
    expect(types).toEqual([
      "step:started",
      "step:completed",
      "step:started",
      "step:completed",
      "trace:completed",
    ]);
  });
});

// ─── Subscriber ───────────────────────────────────

describe("subscribeToAgentTrace", () => {
  test("receives published events", async () => {
    const controller = new AbortController();
    const events: AgentTraceEvent[] = [];
    const publisher = new AgentTracePublisher("sub-trace-1");

    // Start consuming in background (generator doesn't execute until iterated)
    const consumePromise = (async () => {
      for await (const event of subscribeToAgentTrace(
        "sub-trace-1",
        controller.signal,
      )) {
        events.push(event);
        if (event.type === "trace:completed") break;
      }
    })();

    // Wait for the subscriber to call Redis subscribe
    await waitForSubscription(1);

    // Publish events (they arrive via mock Pub/Sub to the message handler)
    await publisher.publishStepStarted(1, "skill-a");
    await publisher.publishStepCompleted(1, "skill-a", "SUCCESS", 50);
    await publisher.publishTraceCompleted("COMPLETED", "COMPLETED", 1, 100);

    await consumePromise;

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("step:started");
    expect(events[1].type).toBe("step:completed");
    expect(events[2].type).toBe("trace:completed");
  });

  test("subscribes to correct Redis channel", async () => {
    const controller = new AbortController();
    const publisher = new AgentTracePublisher("sub-trace-2");

    const consumePromise = (async () => {
      for await (const _event of subscribeToAgentTrace(
        "sub-trace-2",
        controller.signal,
      )) {
        break;
      }
    })();

    await waitForSubscription(1);

    // Publish a final event so the generator can close
    await publisher.publishTraceCompleted("COMPLETED", "COMPLETED", 0, 0);

    await consumePromise;

    expect(mockRedisSubscribe).toHaveBeenCalledWith(
      "agent:trace:sub-trace-2",
    );
  });

  test("auto-closes generator after trace:completed event", async () => {
    const controller = new AbortController();
    const events: AgentTraceEvent[] = [];
    const publisher = new AgentTracePublisher("sub-trace-3");

    const consumePromise = (async () => {
      for await (const event of subscribeToAgentTrace(
        "sub-trace-3",
        controller.signal,
      )) {
        events.push(event);
        // Don't break — generator should auto-close after trace:completed
      }
    })();

    await waitForSubscription(1);

    await publisher.publishTraceCompleted("FAILED", "ERROR", 0, 10);

    await consumePromise;

    // Should have exactly 1 event, then generator auto-closed
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("trace:completed");
  });

  test("cleans up Redis on abort", async () => {
    const controller = new AbortController();

    const consumePromise = (async () => {
      const events: AgentTraceEvent[] = [];
      for await (const event of subscribeToAgentTrace(
        "sub-trace-4",
        controller.signal,
      )) {
        events.push(event);
      }
      return events;
    })();

    await waitForSubscription(1);

    // Abort
    controller.abort();

    const events = await consumePromise;

    expect(events).toHaveLength(0);
    expect(mockRedisUnsubscribe).toHaveBeenCalled();
    expect(mockRedisQuit).toHaveBeenCalled();
  });

  test("ignores messages on wrong channel", async () => {
    const controller = new AbortController();
    const events: AgentTraceEvent[] = [];

    const consumePromise = (async () => {
      for await (const event of subscribeToAgentTrace(
        "sub-trace-5",
        controller.signal,
      )) {
        events.push(event);
        if (event.type === "trace:completed") break;
      }
    })();

    await waitForSubscription(1);

    // Publish to a different trace ID (wrong channel)
    const wrongPublisher = new AgentTracePublisher("other-trace");
    await wrongPublisher.publishStepStarted(1, "skill-x");

    // Publish to correct trace to close the generator
    const rightPublisher = new AgentTracePublisher("sub-trace-5");
    await rightPublisher.publishTraceCompleted("COMPLETED", "COMPLETED", 0, 0);

    await consumePromise;

    // Should only get the trace:completed from the correct publisher
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("trace:completed");
  });
});
