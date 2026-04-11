/**
 * tRPC Subscription router — SSE-based real-time event streaming.
 *
 * Uses Redis Pub/Sub as the bridge between BullMQ workers and client SSE.
 * See docs/adr/003-bullmq-async-ai.md
 */

import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import {
  subscribeToChannel,
  sessionChannel,
  helpChannel,
  type JobResultEvent,
} from "@/lib/infra/events";
import {
  subscribeToAgentTrace,
  type AgentTraceEvent,
} from "@/lib/domain/agent/trace-publisher";

const jobResultSchema = z.object({
  type: z.enum(["ocr-recognize", "correction-photos", "help-generate"]),
  status: z.enum(["completed", "failed"]),
  data: z.unknown().optional(),
  error: z.string().optional(),
});

export const subscriptionRouter = router({
  /**
   * Listen for session-level job completions (OCR recognition, correction photos).
   * Frontend subscribes when session.status === "RECOGNIZING" or correction is pending.
   */
  onSessionJobComplete: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .subscription(async function* (opts) {
      const channel = sessionChannel(opts.input.sessionId);
      const signal = opts.signal ?? AbortSignal.timeout(300_000); // 5 min max
      for await (const event of subscribeToChannel(channel, signal)) {
        yield event satisfies JobResultEvent;
      }
    }),

  /**
   * Listen for help generation completion.
   * Frontend subscribes when user requests help and the job is queued.
   */
  onHelpGenerated: protectedProcedure
    .input(z.object({ sessionId: z.string(), questionId: z.string() }))
    .subscription(async function* (opts) {
      const channel = helpChannel(
        opts.input.sessionId,
        opts.input.questionId,
      );
      const signal = opts.signal ?? AbortSignal.timeout(300_000);
      for await (const event of subscribeToChannel(channel, signal)) {
        yield event satisfies JobResultEvent;
      }
    }),

  /**
   * Listen for Agent trace step events (real-time execution progress).
   * Frontend subscribes when an Agent run starts; receives step:started,
   * step:completed, and trace:completed events via SSE.
   * See: docs/adr/008-agent-architecture.md #6
   */
  onAgentTraceUpdate: protectedProcedure
    .input(z.object({ traceId: z.string() }))
    .subscription(async function* (opts) {
      const signal = opts.signal ?? AbortSignal.timeout(300_000);
      for await (const event of subscribeToAgentTrace(
        opts.input.traceId,
        signal,
      )) {
        yield event satisfies AgentTraceEvent;
      }
    }),
});
