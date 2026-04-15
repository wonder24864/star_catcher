/**
 * buildJaegerUrl — 后端唯一构造 Jaeger UI 深链的入口。
 *
 * 前端不直接读取 JAEGER_UI_URL env，始终通过 tRPC 响应中已构造好的
 * jaegerUrl 字段渲染，避免基础设施地址泄露到浏览器。
 *
 * 返回 null 的两种情况都让前端降级为 disabled 按钮：
 *   1. JAEGER_UI_URL 未配置（生产/开发环境未部署 Jaeger）
 *   2. traceId 为 null（OTEL 未启用或 span 未采样）
 *
 * See: Sprint 15 US-057
 */

export function buildJaegerUrl(traceId: string | null | undefined): string | null {
  if (!traceId) return null;
  const base = process.env.JAEGER_UI_URL;
  if (!base) return null;
  // Jaeger UI 标准路径：/trace/{traceId}
  return `${base.replace(/\/$/, "")}/trace/${traceId}`;
}
