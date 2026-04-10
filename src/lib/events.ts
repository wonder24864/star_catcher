/**
 * Redis Pub/Sub event bridge for BullMQ → tRPC SSE subscriptions.
 *
 * Worker publishes job results via Redis PUBLISH.
 * tRPC subscriptions consume via Redis SUBSCRIBE and yield to SSE.
 */

import Redis from "ioredis";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export type JobResultEvent = {
  type: "ocr-recognize" | "correction-photos" | "help-generate";
  status: "completed" | "failed";
  data?: unknown;
  error?: string;
};

// ---------------------------------------------------------------------------
// Channel naming
// ---------------------------------------------------------------------------

export function sessionChannel(sessionId: string): string {
  return `job:result:session:${sessionId}`;
}

export function helpChannel(sessionId: string, questionId: string): string {
  return `job:result:help:${sessionId}:${questionId}`;
}

// ---------------------------------------------------------------------------
// Publisher (used by Worker)
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

export async function publishJobResult(
  channel: string,
  event: JobResultEvent,
): Promise<void> {
  await getPublisher().publish(channel, JSON.stringify(event));
}

// ---------------------------------------------------------------------------
// Subscriber (used by tRPC Subscription)
// ---------------------------------------------------------------------------

/**
 * Async generator that yields events from a Redis channel.
 * Cleans up the subscription when the AbortSignal fires (SSE disconnect).
 */
export async function* subscribeToChannel(
  channel: string,
  signal: AbortSignal,
): AsyncGenerator<JobResultEvent> {
  // Each subscriber needs its own Redis connection (ioredis requirement)
  const sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  // Buffer for messages received between yields
  const buffer: JobResultEvent[] = [];
  let resolve: (() => void) | null = null;

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      buffer.push(JSON.parse(message) as JobResultEvent);
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
        yield buffer.shift()!;
      }

      // Wait for next message or abort
      await new Promise<void>((r) => {
        resolve = r;
        // Also resolve on abort so we can exit the loop
        signal.addEventListener("abort", () => r(), { once: true });
      });
    }
  } finally {
    sub.off("message", onMessage);
    await sub.unsubscribe(channel).catch(() => {});
    await sub.quit().catch(() => {});
  }
}
