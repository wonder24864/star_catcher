/**
 * captureOtelTraceId — 从当前 active OTEL span 提取 W3C traceId（32 hex）。
 *
 * 用于 AgentTrace.otelTraceId 字段，后端可据此构造 Jaeger 深链。
 * OTEL 未启用时返回 null（不报错）。
 *
 * 前置：调用点必须处于 withSpan() 内部（否则无 active span，返 null）。
 * 配合 withAgentSpan() 使用，见本文件。
 */

import { trace } from "@opentelemetry/api";
import { withSpan } from "./tracer";

export function captureOtelTraceId(): string | null {
  if (process.env.OTEL_ENABLED !== "true") return null;
  const span = trace.getActiveSpan();
  const traceId = span?.spanContext().traceId;
  // 过滤无效 traceId（未采样 span 可能返回全零）
  if (!traceId || /^0+$/.test(traceId)) return null;
  return traceId;
}

/**
 * withAgentSpan — 为一次 Agent 执行创建 OTEL 父 span 并提供 traceId 回调。
 *
 * 用法：
 *   await withAgentSpan("intervention-planning", { studentId, userId }, async (otelTraceId) => {
 *     await db.agentTrace.create({ data: { ..., otelTraceId } });
 *     // run agent, update trace, etc — 全部 pipeline 子 span 都会继承这个父 traceId
 *   });
 *
 * OTEL 未启用时：不创建 span，callback 收到 null，零开销直通。
 */
export async function withAgentSpan<T>(
  agentName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (otelTraceId: string | null) => Promise<T>,
): Promise<T> {
  return withSpan(`agent.${agentName}`, attributes, () => fn(captureOtelTraceId()));
}
