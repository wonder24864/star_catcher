"use client";

/**
 * JaegerLink — 展示 Jaeger UI 深链（或 disabled 状态）
 *
 * 后端通过 tRPC 返回 `jaegerUrl: string | null`：
 *   - 非 null：OTEL 启用 + span 采样 + JAEGER_UI_URL 配置齐全
 *   - null：任一条件缺失 → 按钮 disabled + tooltip 提示
 *
 * 前端不读 env，完全依赖后端构造的 URL。
 */

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function JaegerLink({ jaegerUrl }: { jaegerUrl: string | null | undefined }) {
  const t = useTranslations("admin.jaeger");

  if (jaegerUrl) {
    return (
      <a href={jaegerUrl} target="_blank" rel="noreferrer noopener">
        <Button variant="outline" size="sm">
          {t("open")} ↗
        </Button>
      </a>
    );
  }

  return (
    <Button variant="outline" size="sm" disabled title={t("disabled")}>
      {t("open")}
    </Button>
  );
}
