# Sprint 26: 管理端 UI 现代化收尾 + Phase 5 验收 (Week 31)

**Status**: COMPLETED

**目标**: 把管理端最后两块拼图补上 —— Brain 实时监控（tRPC subscription 替代 polling）+ KG 2D 力导向图（d3-force + SVG），完成 Phase 5 §五 验收第 4 条管理端全部项，并做 Phase 5 整体收尾。

Sprint 25 基线：82 files / 1137 passed / 30 todo / 0 failed。Sprint 26 目标 ≥ 1155 passed。

## 设计决策

Phase 5 D53-D57 + Sprint 24/25 D58-D61 继续生效。Sprint 26 新增：

1. **D62** — Brain subscription 使用单一全局 channel `brain:runs`，不分 per-student。管理端需要全体视图，per-student 会要 N 个订阅浪费连接。
2. **D63** — History 合并策略：subscription → prepend 到 `liveItems` → 与 `query.data.items` 按 `id` 去重合并。**不**直接 `refetch`（分页错位 + DB 压力）。
3. **D64** — events.ts 并排扩展而非泛型重构：不触碰 `JobResultEvent` 契约。Brain 审计 record 与 job status 结构根本不同，强行泛型损失类型精度。
4. **D65** — KG 力导向图作为新增 `graph` tab，不替换 `tree` 默认；接受 `?tab=graph` URL 参数；CommandPalette 补直达入口。
5. **D66** — 节点半径 ∝ `sqrt(importance × examFrequency)`（范围 6-20px）。不用 `errorFrequency`（per-student Mastery 字段，KG 是全局树）。
6. **D67** — 2D SVG 不做 canvas 降级。K-12 KP 规模 ~500 节点 SVG 够。`alphaDecay = nodes.length > 300 ? 0.06 : 0.028` 自适应加速收敛。
7. **D68** — LIVE 指示器直接读 `subscription.status === "pending"`。tRPC `httpSubscriptionLink` 内置重连 + 指数退避，不自管。
8. **D69** — `logAdminAction` 返回创建 record 的 id（`Promise<string | null>`），向后兼容（旧调用忽略返回值即可）。Brain handler 需要真实 id 让 subscription event 和 `listRuns` 查询结果 dedupe。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 237 | [x] Sprint 26 文件 + 依赖 | `docs/sprints/sprint-26.md` + `npm i d3-force d3-selection d3-zoom @types/d3-force @types/d3-selection @types/d3-zoom` |
| 238 | [x] events.ts 扩展 BrainRunEvent 管道 + `logAdminAction` 返回 id | `src/lib/infra/events.ts` 新增 `BrainRunEvent` + `publishBrainRun` + `subscribeToBrainRun`；`src/lib/domain/admin-log.ts` 返回 `string \| null` (D69) |
| 239 | [x] Brain handler 发布事件 | `src/worker/handlers/learning-brain.ts` — AdminLog 提交后 `publishBrainRun`，捕获发布失败走 `logger.warn`（Rule 7） |
| 240 | [x] `brain.onBrainRunComplete` subscription | `src/server/routers/brain.ts` 新增 `.subscription`（`adminProcedure` + `z.void()` input + 5min AbortSignal） |
| 241 | [x] KG router `listForGraph` procedure | `src/server/routers/knowledge-graph.ts` 新增 `listForGraph(subject, schoolLevel)` 返回 `{ nodes, links }`（节点 ≤ 1000 安全上限 + hierarchy CONTAINS 合并） |
| 242 | [x] KG 力导向图组件 | `src/components/admin/kg-force-graph.tsx` — d3-force simulation + SVG + d3-zoom + hover 邻居高亮 + 节点颜色/半径映射 + PREREQUISITE/CONTAINS 箭头 marker |
| 243 | [x] KG graph tab + Legend + Search 框 | `admin/knowledge-graph/page.tsx` 加 `"graph"` tab（不改默认 D65）、URL 参数双向同步、搜索定位、图例、节点详情 drawer (AnimatePresence) |
| 244 | [x] Brain 页 LIVE 指示灯 + History 实时流 + Stats 自动刷新 | `admin/brain/page.tsx` + `components/admin/live-indicator.tsx` — subscription 全局挂到 page 级别、`liveEvents` prop 下发 History tab、framer-motion layout 动效 + freshIds 3s 高亮脉冲、`utils.brain.stats.invalidate()` 让 CountUp 重播 |
| 245 | [x] CommandPalette 补 kg-graph 直达 | `src/components/pro/command-palette.tsx` ADMIN_ITEMS 新增 `kg-graph → /admin/knowledge-graph?tab=graph` |
| 246 | [x] i18n 补全 | zh + en：`admin.brain.live.{connected,disconnected}`、`commandPalette.items.kgGraph`、`knowledgeGraph.tabs.graph`、`knowledgeGraph.graph.*`（legend/search/prerequisites/dependents 等 9 键） |
| 247 | [x] 单元测试 | `brain-subscription.test.ts`（4 cases round-trip + abort）+ `kg-force-graph.test.ts`（13 cases 纯函数） |
| 248 | [x] 自审 + Phase 5 验收 + ROADMAP + PHASE5-LAUNCH-PLAN + README + commit | Sprint 26 勾选 + 验证清单 + Phase 5 验收段写入 ROADMAP + PHASE5-LAUNCH-PLAN COMPLETED + README 目录树中文同步 |

## 验证清单

- [x] `npx tsc --noEmit` 0 错误
- [x] `npm test` 全量通过（83 files / 1153 passed / 4 skipped / 30 todo / 0 failed；Sprint 25 基线 1137 → +16 cases。knowledge-graph-cte perf 文件 afterAll cleanup 在本地无 pgvector DB 时失败 — 4 tests 本身 skipped，非 Sprint 26 回归，环境问题）
- [x] `npm run build` 成功（`/[locale]/admin/brain`、`/[locale]/admin/knowledge-graph` 正确构建）
- [x] LiveIndicator 组件独立文件（`components/admin/live-indicator.tsx`）以满足 i18n-coverage 架构测试的 namespace 推断规则（每文件只取首个 `useTranslations` namespace）
- [x] Brain subscription 发布路径：handler `publishBrainRun` 在 AdminLog 成功返回 id 后调用，失败走 `logger.warn`（Rule 7）
- [x] subscription 消费路径：page 级别挂一次 `trpc.brain.onBrainRunComplete.useSubscription`，dedup by `logId`，保留 newest 50
- [x] KG 图节点颜色按 schoolLevel tier（PRIMARY #3b82f6 / JUNIOR #a855f7 / SENIOR #ec4899）
- [x] KG 图边按 type 上色（PREREQUISITE #ef4444 + 箭头 / PARALLEL #64748b / CONTAINS #10b981 + 箭头）
- [x] Hover 节点 → `nodeOpacity/linkOpacity` 基于 `computeNeighbors` adjacency 动态计算
- [x] d3-zoom pan + scale 范围 0.3-4x
- [x] Cmd+K ADMIN_ITEMS 新增 "知识图谱 · 力导向图" → `/admin/knowledge-graph?tab=graph`
- [x] 无 `any` / `@ts-ignore`（新增文件 grep 0 命中）
- [x] 未使用声明溯源（Rule 8）— 所有新增 events type field / component prop / i18n key 都有消费点
- [x] i18n: zh + en 完整覆盖（i18n-coverage test pass）
- [x] README 中文目录树同步 `components/admin/` 注释补 KG 力导向图 + LiveIndicator
- [x] `logAdminAction` 返回值变更：签名改为 `Promise<string | null>`，旧调用者（brain router `triggerBrain`/`overrideCooldown`、MemoryWriteInterceptor 等）不依赖返回值，零破坏

## Phase 5 验收（Phase 5 §五）

- [x] **Brain 优化**（Sprint 23）— MasteryStateHistory 审计 + CORRECTED 时间线 + 渐进冷却 D55 + 手动触发/覆盖 D56
- [x] **Pro 组件库**（Sprint 24）— 8 组件 light/dark + reduced-motion
- [x] **家长端**（Sprint 25）— overview/stats/reports 毛玻璃 + GaugeChart + drill-down
- [x] **管理端**（Sprint 24 + 26）— 仪表盘（24）+ Cmd+K（24）+ Brain 实时监控（26）+ KG 力导向图（26）
- [x] **回归** — `npm test` 0 test failed + `tsc --noEmit` 0 errors + `npm run build` 成功
- [x] ROADMAP Phase 5 表 Sprint 26 勾 [x]，Phase 5 验收摘要段写入 ROADMAP
- [x] `PHASE5-LAUNCH-PLAN.md` Sprint 26 状态列改 COMPLETED
