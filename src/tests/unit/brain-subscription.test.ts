/**
 * Unit Tests: BrainRunEvent publish/subscribe pipeline (Sprint 26 D62/D64)
 *
 * Verifies:
 *   - Channel constant
 *   - `publishBrainRun` emits JSON on the global channel
 *   - `subscribeToBrainRun` yields published events end-to-end
 *   - Abort signal terminates the generator without leaking handlers
 *
 * Mirrors the ioredis mock pattern used by agent-trace-publisher.test.ts.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  BRAIN_RUNS_CHANNEL,
  publishBrainRun,
  subscribeToBrainRun,
  type BrainRunEvent,
} from "@/lib/infra/events";

// ─── Mock Redis ───────────────────────────────────

type MessageHandler = (channel: string, message: string) => void;

const publishedMessages: { channel: string; message: string }[] = [];
let subscribedChannels: string[] = [];
let messageHandlers: MessageHandler[] = [];

const mockRedisPublish = vi.fn(async (channel: string, message: string) => {
  publishedMessages.push({ channel, message });
  for (const handler of messageHandlers) handler(channel, message);
  return 1;
});
const mockRedisSubscribe = vi.fn(async (channel: string) => {
  subscribedChannels.push(channel);
});
const mockRedisUnsubscribe = vi.fn(async () => {});
const mockRedisQuit = vi.fn(async () => {});

vi.mock("ioredis", () => ({
  default: vi.fn().mockImplementation(() => ({
    publish: mockRedisPublish,
    subscribe: mockRedisSubscribe,
    unsubscribe: mockRedisUnsubscribe,
    quit: mockRedisQuit,
    on: vi.fn((event: string, handler: MessageHandler) => {
      if (event === "message") messageHandlers.push(handler);
    }),
    off: vi.fn((event: string, handler: MessageHandler) => {
      if (event === "message")
        messageHandlers = messageHandlers.filter((h) => h !== handler);
    }),
  })),
}));

beforeEach(() => {
  publishedMessages.length = 0;
  subscribedChannels = [];
  messageHandlers = [];
  vi.clearAllMocks();
});

// ─── Channel constant ─────────────────────────────

describe("BRAIN_RUNS_CHANNEL", () => {
  test("is a stable global channel name", () => {
    expect(BRAIN_RUNS_CHANNEL).toBe("brain:runs");
  });
});

// ─── Publisher ────────────────────────────────────

describe("publishBrainRun", () => {
  test("publishes JSON-serialized event on brain:runs", async () => {
    const event: BrainRunEvent = {
      logId: "log-1",
      studentId: "stu-1",
      studentNickname: "Alice",
      eventsProcessed: 3,
      agentsLaunched: [{ jobName: "intervention-planning", reason: "cooldown-ok" }],
      skipped: [],
      durationMs: 1234,
      createdAt: "2026-04-17T12:00:00.000Z",
    };

    await publishBrainRun(event);

    expect(publishedMessages).toHaveLength(1);
    expect(publishedMessages[0].channel).toBe("brain:runs");
    const parsed = JSON.parse(publishedMessages[0].message) as BrainRunEvent;
    expect(parsed).toEqual(event);
  });
});

// ─── Round-trip: subscriber yields published events ───

describe("subscribeToBrainRun", () => {
  test("yields events as they are published", async () => {
    const controller = new AbortController();
    const iter = subscribeToBrainRun(controller.signal);

    // Start consumption in parallel with a single .next() per published event.
    const received: BrainRunEvent[] = [];

    const consume = (async () => {
      for await (const event of iter) {
        received.push(event);
        if (received.length >= 2) {
          controller.abort();
          break;
        }
      }
    })();

    // Wait for subscribe to register
    for (let i = 0; i < 50; i++) {
      if (subscribedChannels.includes("brain:runs")) break;
      await new Promise((r) => setTimeout(r, 5));
    }
    expect(subscribedChannels).toContain("brain:runs");

    const base: BrainRunEvent = {
      logId: "log-1",
      studentId: "stu-1",
      studentNickname: "Alice",
      eventsProcessed: 1,
      agentsLaunched: [],
      skipped: [],
      durationMs: 10,
      createdAt: "2026-04-17T12:00:00.000Z",
    };

    await publishBrainRun({ ...base, logId: "log-1" });
    await publishBrainRun({ ...base, logId: "log-2" });

    await consume;

    expect(received.map((e) => e.logId)).toEqual(["log-1", "log-2"]);
    // Cleanup on abort
    expect(mockRedisUnsubscribe).toHaveBeenCalled();
    expect(mockRedisQuit).toHaveBeenCalled();
  });

  test("abort signal terminates generator and unsubscribes", async () => {
    const controller = new AbortController();
    const iter = subscribeToBrainRun(controller.signal);

    const run = (async () => {
      for await (const _ of iter) {
        // no-op
      }
    })();

    // Wait for subscribe
    for (let i = 0; i < 50; i++) {
      if (subscribedChannels.includes("brain:runs")) break;
      await new Promise((r) => setTimeout(r, 5));
    }

    controller.abort();
    await run;

    expect(mockRedisUnsubscribe).toHaveBeenCalledWith("brain:runs");
    expect(mockRedisQuit).toHaveBeenCalled();
  });
});
