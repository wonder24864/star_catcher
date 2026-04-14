/**
 * withSpan() — wraps a function call in an OTel trace span.
 *
 * When OTEL_ENABLED=false: zero overhead, directly calls fn().
 * When OTEL_ENABLED=true: creates a span with name + attributes,
 * records errors, and sets span status.
 *
 * See: docs/sprints/sprint-10a.md (Task 92)
 */

import { trace, SpanStatusCode } from "@opentelemetry/api";

const TRACER_NAME = "star-catcher";

/**
 * Execute fn() inside an OTel span. Gracefully degrades if OTel is not initialized.
 */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  if (process.env.OTEL_ENABLED !== "true") {
    return fn();
  }

  const tracer = trace.getTracer(TRACER_NAME);

  return tracer.startActiveSpan(name, async (span) => {
    try {
      // Set attributes
      for (const [key, value] of Object.entries(attributes)) {
        span.setAttribute(key, value);
      }

      const result = await fn();
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}
