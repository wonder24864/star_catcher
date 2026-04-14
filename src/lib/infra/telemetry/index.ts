/**
 * OpenTelemetry initialization — opt-in via OTEL_ENABLED=true.
 *
 * Exports initTelemetry() for Next.js instrumentation hook and Worker entry.
 * When disabled, no SDK is loaded and withSpan() is a zero-cost pass-through.
 *
 * See: docs/sprints/sprint-10a.md (Task 92)
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK.
 * Call once per process (Next.js app or Worker).
 * No-op if OTEL_ENABLED !== "true".
 */
export function initTelemetry(serviceName: string): void {
  if (process.env.OTEL_ENABLED !== "true") return;
  if (sdk) return; // Already initialized

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
    }),
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
  });

  sdk.start();

  // Graceful shutdown
  const shutdown = () => {
    sdk
      ?.shutdown()
      .catch((err) => console.error("OTel shutdown error:", err));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
