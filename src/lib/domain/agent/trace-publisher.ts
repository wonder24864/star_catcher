/**
 * AgentTracePublisher — publishes Agent execution step events
 * via Redis Pub/Sub for real-time SSE streaming to frontend.
 *
 * Reuses the Phase 1 Redis Pub/Sub infrastructure (src/lib/infra/events.ts pattern).
 *
 * Events:
 *   - step:started  — a new step begins execution
 *   - step:completed — a step finished (success/fail/timeout)
 *   - trace:completed — the entire agent trace finished
 *
 * See: docs/adr/008-agent-architecture.md #6
 */
import Redis from "ioredis";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface AgentTraceStepEvent {
  type: "step:started" | "step:completed";
  traceId: string;
  stepNo: number;
  skillName: string;
  status?: "SUCCESS" | "FAILED" | "TIMEOUT";
  durationMs?: number;
  errorMessage?: string;
}

export interface AgentTraceCompleteEvent {
  type: "trace:completed";
  traceId: string;
  status: "COMPLETED" | "TERMINATED" | "FAILED";
  terminationReason: string;
  totalSteps: number;
  totalDurationMs: number;
  summary?: string;
}

export type AgentTraceEvent = AgentTraceStepEvent | AgentTraceCompleteEvent;

// ---------------------------------------------------------------------------
// Channel naming
// ---------------------------------------------------------------------------

/**
 * Redis channel for a specific Agent trace.
 * Frontend subscribes per-trace to receive step-level updates.
 */
export function agentTraceChannel(traceId: string): string {
  return `agent:trace:${traceId}`;
}

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

let publisher: Redis | null = null;

function getPublisher(): Redis {
  if (!publisher) {
    publisher = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
  }
  return publisher;
}

export class AgentTracePublisher {
  private readonly traceId: string;
  private readonly channel: string;

  constructor(traceId: string) {
    this.traceId = traceId;
    this.channel = agentTraceChannel(traceId);
  }

  /**
   * Publish that a step has started executing.
   */
  async publishStepStarted(stepNo: number, skillName: string): Promise<void> {
    const event: AgentTraceStepEvent = {
      type: "step:started",
      traceId: this.traceId,
      stepNo,
      skillName,
    };
    await this.publish(event);
  }

  /**
   * Publish that a step has completed (with result status).
   */
  async publishStepCompleted(
    stepNo: number,
    skillName: string,
    status: "SUCCESS" | "FAILED" | "TIMEOUT",
    durationMs: number,
    errorMessage?: string,
  ): Promise<void> {
    const event: AgentTraceStepEvent = {
      type: "step:completed",
      traceId: this.traceId,
      stepNo,
      skillName,
      status,
      durationMs,
      errorMessage,
    };
    await this.publish(event);
  }

  /**
   * Publish that the entire Agent trace has completed.
   */
  async publishTraceCompleted(
    status: "COMPLETED" | "TERMINATED" | "FAILED",
    terminationReason: string,
    totalSteps: number,
    totalDurationMs: number,
    summary?: string,
  ): Promise<void> {
    const event: AgentTraceCompleteEvent = {
      type: "trace:completed",
      traceId: this.traceId,
      status,
      terminationReason,
      totalSteps,
      totalDurationMs,
      summary,
    };
    await this.publish(event);
  }

  private async publish(event: AgentTraceEvent): Promise<void> {
    await getPublisher().publish(this.channel, JSON.stringify(event));
  }
}

// ---------------------------------------------------------------------------
// Subscriber (used by tRPC subscription)
// ---------------------------------------------------------------------------

/**
 * Async generator that yields AgentTrace events from a Redis channel.
 * Cleans up the subscription when the AbortSignal fires (SSE disconnect).
 *
 * Follows the same pattern as subscribeToChannel in src/lib/infra/events.ts.
 */
export async function* subscribeToAgentTrace(
  traceId: string,
  signal: AbortSignal,
): AsyncGenerator<AgentTraceEvent> {
  const channel = agentTraceChannel(traceId);

  // Each subscriber needs its own Redis connection (ioredis requirement)
  const sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  // Buffer for messages received between yields
  const buffer: AgentTraceEvent[] = [];
  let resolve: (() => void) | null = null;

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      buffer.push(JSON.parse(message) as AgentTraceEvent);
    } catch {
      // Ignore malformed messages
      return;
    }
    // Wake up the generator if it's waiting
    if (resolve) {
      resolve();
      resolve = null;
    }
  };

  sub.on("message", onMessage);
  await sub.subscribe(channel);

  try {
    while (!signal.aborted) {
      // Drain buffer
      while (buffer.length > 0) {
        const event = buffer.shift()!;
        yield event;

        // Auto-close after trace:completed — no more events expected
        if (event.type === "trace:completed") {
          return;
        }
      }

      // Wait for next message or abort
      if (signal.aborted) break;
      await new Promise<void>((r) => {
        resolve = r;
        if (signal.aborted) { r(); return; }
        signal.addEventListener("abort", () => r(), { once: true });
      });
    }
  } finally {
    sub.off("message", onMessage);
    await sub.unsubscribe(channel).catch(() => {});
    await sub.quit().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Test helper: allow injecting a mock publisher for unit tests
// ---------------------------------------------------------------------------

/** Reset the internal publisher (for tests only). */
export function __resetPublisher(): void {
  if (publisher) {
    publisher.disconnect();
    publisher = null;
  }
}
