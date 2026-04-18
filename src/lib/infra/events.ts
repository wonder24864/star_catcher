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
  type:
    | "ocr-recognize"
    | "correction-photos"
    | "help-generate"
    | "kg-import"
    | "question-understanding"
    | "diagnosis"
    | "learning-suggestion";
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

export function masteryChannel(studentId: string): string {
  return `mastery:student:${studentId}`;
}

export function learningSuggestionChannel(studentId: string): string {
  return `job:result:learning-suggestion:${studentId}`;
}

/**
 * MasteryUpdateEvent — broadcast when a student's review schedule / mastery
 * state changes. Consumed by today-reviews card (and any future dashboard
 * widgets) to invalidate cached queries without polling.
 */
export type MasteryUpdateEvent =
  | { kind: "review-submitted"; knowledgePointId: string }
  | { kind: "review-scheduled"; knowledgePointId: string; nextReviewAt: string }
  | { kind: "mastery-transitioned"; knowledgePointId: string; from: string; to: string };

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

export async function publishMasteryUpdate(
  studentId: string,
  event: MasteryUpdateEvent,
): Promise<void> {
  await getPublisher().publish(masteryChannel(studentId), JSON.stringify(event));
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
      if (signal.aborted) break;
      await new Promise<void>((r) => {
        resolve = r;
        // Also resolve on abort so we can exit the loop
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

/**
 * Typed subscriber for mastery channel. Mirrors subscribeToChannel but yields
 * MasteryUpdateEvent (parallel to JobResultEvent / BrainRunEvent pattern).
 */
export async function* subscribeToMastery(
  studentId: string,
  signal: AbortSignal,
): AsyncGenerator<MasteryUpdateEvent> {
  const channel = masteryChannel(studentId);
  const sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  const buffer: MasteryUpdateEvent[] = [];
  let resolve: (() => void) | null = null;

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      buffer.push(JSON.parse(message) as MasteryUpdateEvent);
    } catch {
      return;
    }
    if (resolve) {
      resolve();
      resolve = null;
    }
  };

  sub.on("message", onMessage);
  await sub.subscribe(channel);

  try {
    while (!signal.aborted) {
      while (buffer.length > 0) {
        yield buffer.shift()!;
      }
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
// Sprint 26 D62/D64 — Brain run event pipeline (parallel to JobResultEvent)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ADR-012 — User-wide task progress channel
// ---------------------------------------------------------------------------

export type TaskProgressEvent = {
  taskId: string;
  type: "OCR" | "CORRECTION" | "HELP" | "SUGGESTION" | "EVAL" | "BRAIN";
  key: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  step?: string;
  progress?: number;
  resultRef?: { route: string; payload?: unknown };
  errorCode?: string;
  errorMessage?: string;
  updatedAt: string; // ISO 8601
};

export function userTaskChannel(userId: string): string {
  return `task:user:${userId}`;
}

export async function publishTaskEvent(
  userId: string,
  event: TaskProgressEvent,
): Promise<void> {
  await getPublisher().publish(userTaskChannel(userId), JSON.stringify(event));
}

/**
 * Async generator yielding TaskProgressEvent from the per-user task channel.
 * Mirrors subscribeToMastery / subscribeToBrainRun typing pattern.
 */
export async function* subscribeToUserTasks(
  userId: string,
  signal: AbortSignal,
): AsyncGenerator<TaskProgressEvent> {
  const channel = userTaskChannel(userId);
  const sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  const buffer: TaskProgressEvent[] = [];
  let resolve: (() => void) | null = null;

  const onMessage = (ch: string, message: string) => {
    if (ch !== channel) return;
    try {
      buffer.push(JSON.parse(message) as TaskProgressEvent);
    } catch {
      return;
    }
    if (resolve) {
      resolve();
      resolve = null;
    }
  };

  sub.on("message", onMessage);
  await sub.subscribe(channel);

  try {
    while (!signal.aborted) {
      while (buffer.length > 0) {
        yield buffer.shift()!;
      }
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
// Sprint 26 D62/D64 — Brain run event pipeline (parallel to JobResultEvent)
// ---------------------------------------------------------------------------

/**
 * Brain run completion event — one per learning-brain handler run.
 * Payload mirrors the AdminLog `brain-run` details so the Brain monitor
 * History tab can prepend without refetching.
 */
export type BrainRunEvent = {
  logId: string;
  studentId: string;
  studentNickname: string | null;
  eventsProcessed: number;
  agentsLaunched: Array<{ jobName: string; reason: string }>;
  skipped: Array<{ jobName: string; reason: string }>;
  durationMs: number;
  createdAt: string; // ISO 8601
};

export const BRAIN_RUNS_CHANNEL = "brain:runs";

export async function publishBrainRun(event: BrainRunEvent): Promise<void> {
  await getPublisher().publish(BRAIN_RUNS_CHANNEL, JSON.stringify(event));
}

/**
 * Async generator yielding BrainRunEvent from the global brain:runs channel.
 * Mirrors subscribeToChannel but for a fixed channel + typed event.
 */
export async function* subscribeToBrainRun(
  signal: AbortSignal,
): AsyncGenerator<BrainRunEvent> {
  const sub = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  const buffer: BrainRunEvent[] = [];
  let resolve: (() => void) | null = null;

  const onMessage = (ch: string, message: string) => {
    if (ch !== BRAIN_RUNS_CHANNEL) return;
    try {
      buffer.push(JSON.parse(message) as BrainRunEvent);
    } catch {
      return;
    }
    if (resolve) {
      resolve();
      resolve = null;
    }
  };

  sub.on("message", onMessage);
  await sub.subscribe(BRAIN_RUNS_CHANNEL);

  try {
    while (!signal.aborted) {
      while (buffer.length > 0) {
        yield buffer.shift()!;
      }
      if (signal.aborted) break;
      await new Promise<void>((r) => {
        resolve = r;
        if (signal.aborted) { r(); return; }
        signal.addEventListener("abort", () => r(), { once: true });
      });
    }
  } finally {
    sub.off("message", onMessage);
    await sub.unsubscribe(BRAIN_RUNS_CHANNEL).catch(() => {});
    await sub.quit().catch(() => {});
  }
}
