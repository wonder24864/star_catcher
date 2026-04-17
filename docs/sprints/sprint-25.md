# Sprint 25: 家长端 UI 改造 (Week 30)

**Status**: COMPLETED

**目标**: 把家长 overview / stats / reports 三页升级到 Pro 视觉 — GlassCard + GradientMesh + CountUp + GaugeChart + InteractiveChart；兑现 Phase 5 plan §二验收第 3 条「毛玻璃改造、GaugeChart 掌握率、交互式图表 drill-down」。

## 设计决策

Phase 5 D53-D57 继续生效。Sprint 25 新增：

1. D58: 把 admin/page.tsx 本地 `StatCard` 提取到 `src/components/pro/stat-card.tsx` — admin + parent 共用，避免重复
2. D59: stats 页 drill-down 用 URL 参数（`/parent/overview?date=YYYY-MM-DD`）—— 不引入全局 state
3. D60: reports 顶部用 `reviewsCompleted / reviewsScheduled` 的 GaugeChart（weekly/monthlyReport 没有 `masteryRate` 字段，不硬凑）
4. D61: 新启用 `parent.interventionEffect` procedure（过去 reports 页未用）—— 驱动新「干预效果」区块成对 GaugeChart pre/post 对比

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 229 | [x] Sprint 25 文件 | `docs/sprints/sprint-25.md` |
| 230 | [x] 提取共享 StatCard 组件 + admin 重构 | `src/components/pro/stat-card.tsx` + `index.ts` export + admin/page.tsx 改用 + 单测 |
| 231 | [x] parent/overview 改造 + `?date=` URL 参数 | overview/page.tsx 重写（GradientMesh + GlassCard + StatusPulse + Skeleton + URL 参数同步） |
| 232 | [x] parent/stats 改造 + errorTrend drill-down | stats/page.tsx 重写（2 个 StatCard + 5 张 InteractiveChart + Bar onClick router.push） |
| 233 | [x] parent/reports 改造 + 干预效果区块 | reports/page.tsx 重写（4 StatCard + reviewCompletionRate GaugeChart + interventionEffect 区块 + InteractiveChart masteryTrend） |
| 234 | [x] i18n 补全 | zh.json + en.json 新增 `parent.stats.clickToView`、`parent.reports.interventionEffectHint`；复用 `parent.intervention.{effectTitle,emptyEffect,preMastery,postMastery}` |
| 235 | [x] 单元测试 | `src/tests/unit/parent-pages-sprint25.test.ts`（20 cases）+ StatCard 测试增补到 `pro-components.test.ts` |
| 236 | [x] 自审 + README + ROADMAP + commit | sprint 勾选 + 中文 README 目录树 + ROADMAP + PHASE5-LAUNCH-PLAN |

## 验证清单

- [x] `npx tsc --noEmit` 0 错误
- [x] `npm test` 全量通过（82 files / 1137 passed / 30 todo / 4 skipped；knowledge-graph-cte perf 文件因本地无 pgvector DB 的 afterAll cleanup 失败 — 4 tests 本身都已 skipped，非 Sprint 25 回归，属环境问题）
- [x] `npm run build` 成功（/parent/overview, /parent/stats, /parent/reports 3 路由都正确构建）
- [x] overview / stats / reports 三页都有 GradientMesh 背景 + GlassCard
- [x] stats errorTrend 柱子 `onClick` → `router.push` 跳 `/parent/overview?date=YYYY-MM-DD`，overview 页通过 `useSearchParams` 接入 URL 参数
- [x] reports 顶部 4 张 StatCard；reviewCompletionRate 用 GaugeChart 嵌入（size=80）
- [x] reports 新「干预效果」区块展示 pre→post 成对 GaugeChart（size=64）+ delta 色标；空态复用 `parent.intervention.emptyEffect`
- [x] StatCard 在 admin + parent 共用（admin/page.tsx 本地定义已删除；单测断言 `function StatCard(` 不存在）
- [x] 学生页面未被误伤（diff 仅涉及 parent/admin 页 + Pro 组件）
- [x] 暗色模式：依赖 Sprint 24 ThemeProvider + .dark CSS 变量（未改 globals.css）
- [x] `prefers-reduced-motion` 降级：全部新增使用的 Pro 组件（GlassCard/CountUp/GaugeChart/StatusPulse/GradientMesh）Sprint 24 测试已覆盖
- [x] 无 `any` / `@ts-ignore`（新增文件 grep 0 命中）
- [x] 未使用声明溯源（Rule 8）— StatCard `trend` prop 评估后不加（YAGNI，仅实际需要的 props）；admin 本地 StatCard 溯源确认仅 admin/page.tsx 一处使用，安全删除
- [x] i18n: zh + en 完整覆盖；重用现有 `parent.intervention.*` 键避免重复
- [x] README 目录树（中文）同步 — `src/components/pro/` 注释补 StatCard
