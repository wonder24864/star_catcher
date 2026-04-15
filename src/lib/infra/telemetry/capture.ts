/**
 * captureOtelTraceId — 从当前 active OTEL span 提取 W3C traceId（32 hex）。
 *
 * 用于 AgentTrace.otelTraceId 字段，后端可据此构造 Jaeger 深链。
 * OTEL 未启用时返回 null（不报错）。
 *
 * See: Sprint 15 US-057 / docs/adr/021-observability-tracer.md (if exists)
 */

import { trace } from "@opentelemetry/api";

export function captureOtelTraceId(): string | null {
  if (process.env.OTEL_ENABLED !== "true") return null;
  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  // 过滤无效 traceId（未采样 span 可能返回全零）
  if (!traceId || /^0+$/.test(traceId)) return null;
  return traceId;
}
