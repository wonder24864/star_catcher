# 管理员 Phase 3 扩展用户故事

Sprint 15 交付：低置信度映射审核（D8）、KG 拖拽层级（D7）、Learning Brain 监控。均为管理员 UI，不触发 Agent / Brain / Memory 写入（Phase 3 模板中 "Memory 写入清单" / "Brain 触发条件" 对这三份均为 N/A）。

---

## US-055: 低置信度映射审核

**As a** 管理员
**I want to** 筛选并批量确认/修正/删除 AI 给出的低置信度 题目→知识点 映射
**So that** 可以持续提升知识图谱映射质量，避免下游诊断/推荐被劣质映射拖垮

**验收标准：**
- [ ] 路径 `/admin/knowledge-graph/mappings`（`src/app/[locale]/(dashboard)/admin/knowledge-graph/mappings/page.tsx`），ADMIN 访问
- [ ] 顶部 filter：confidence 阈值（0.5/0.6/0.7/0.8/0.9，默认 0.7）、subject、schoolLevel、"仅未验证" toggle
- [ ] 列表每行：题目摘要（前 60 字）、当前 KP（Badge）、confidence（颜色分级）、来源（AI_DETECTED/ADMIN_VERIFIED）、验证状态（"未验证" 或 "已验证 YYYY-MM-DD by {nickname}"）、行操作（✔ 确认 / ✎ 换 KP / ✗ 删除）
- [ ] 批量操作：选中 ≥1 行时顶部显示"批量确认 / 批量删除"
- [ ] 行点击打开 Drawer 显示原题全文
- [ ] 换 KP 操作打开 Popover，调 `knowledgeGraph.search` 搜索候选
- [ ] 所有写操作（确认/换 KP/删除）写入 AdminLog，action 分别为 `verify-mappings` / `update-mapping` / `delete-mapping`
- [ ] 排序：`verifiedAt asc nulls first, confidence asc`（未验证且置信度最低的优先）

**边界条件：**
- 非 ADMIN 访问任意 procedure：tRPC FORBIDDEN
- 批量确认时若某条 mapping 已被其他管理员确认：保持幂等，不重复写 AdminLog
- 换 KP 后若违反 `unique(questionId, knowledgePointId)`：tRPC 抛 CONFLICT，前端 toast 错误
- confidence 阈值 ≥ 1.0：返回空列表（无此类 mapping）

**性能要求：**
- 列表 query < 500ms（新 composite index `[verifiedAt, confidence]` 命中）
- 批量确认 < 1s / 50 条

**Memory 写入清单：** N/A (admin UI)
**Brain 触发条件：** N/A (admin UI)

### tRPC 契约

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| knowledgeGraph.listLowConfidenceMappings | `{ threshold, subject?, schoolLevel?, onlyUnverified?, page, pageSize }` | `{ items, total }` 含题目摘要 + KP + verifier | ADMIN |
| knowledgeGraph.batchVerifyMappings | `{ mappingIds: string[] }` | `{ count }` | ADMIN |
| knowledgeGraph.updateMapping | `{ id, newKnowledgePointId }` | updated row | ADMIN |
| knowledgeGraph.deleteMapping | `{ id }` | `{ deleted: true }` | ADMIN |

### Schema 变更

`QuestionKnowledgeMapping`：新增 `verifiedBy String?` (FK→User, onDelete:SetNull)、`verifiedAt DateTime?`；新增 composite index `[verifiedAt, confidence]`。

---

## US-056: KG 拖拽层级与排序

**As a** 管理员
**I want to** 在 KG 管理页面通过拖拽调整知识点的父子层级和兄弟顺序
**So that** 不再需要手动改 parentId，图谱维护更直观

**验收标准：**
- [ ] `/admin/knowledge-graph` 新增 Tab「层级编辑」（原「tree」改名「列表」）
- [ ] 按 subject + schoolLevel 加载一棵树，从根（parentId=null）递归展示
- [ ] 节点可折叠/展开（localStorage 记忆状态，key `kg-tree-expanded:{subject}`）
- [ ] 同父内拖拽 → 重新排序（调 `reorderSiblings`）
- [ ] 跨父拖拽 → Dialog 二次确认 → 调 `update({ parentId })`
- [ ] 拖拽自动禁用：目标不能是自身或后代（客户端过滤 + 服务端 cycle check 兜底）
- [ ] 跨父移动后 **自身 + 所有后代 depth 级联重算**（修现有 `update` 只重算自身的 bug）
- [ ] maxDepth=10（防环保险）；超限抛 BAD_REQUEST
- [ ] 键盘可达：@dnd-kit keyboard sensor 支持（Tab/Space/方向键）
- [ ] 组件 SSR: false，避免 hydration 错配

**边界条件：**
- 拖拽到自身后代：UI 禁用 + 服务端拒绝（CYCLE 错误）
- 子树深度超 maxDepth：拒绝 + toast 提示
- 同父排序时某 id 不属于该 parentId：tRPC BAD_REQUEST
- 空树 / 单节点：正常渲染，无可拖拽项

**性能要求：**
- 同父排序 < 300ms（事务内 N 条 update）
- 跨父 + 子树 depth 级联（n=50 节点）< 500ms

**Memory 写入清单：** N/A (admin UI)
**Brain 触发条件：** N/A (admin UI)

### tRPC 契约

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| knowledgeGraph.update | 既有入参 + 可选 `sortOrder` | updated row | ADMIN |
| knowledgeGraph.reorderSiblings | `{ parentId: string\|null, orderedIds: string[] }` | `{ count }` | ADMIN |

### Schema 变更

`KnowledgePoint`：新增 `sortOrder Int @default(0)` + index `[parentId, sortOrder]`。Migration 回填：`ROW_NUMBER() OVER (PARTITION BY parentId ORDER BY createdAt) - 1`。

### 依赖

- `@dnd-kit/core` + `@dnd-kit/sortable`（~12kB gzip 合计）

---

## US-057: Brain 执行监控

**As a** 管理员
**I want to** 查看 Learning Brain 每次执行的历史、某学生的状态、最近的聚合统计，并能跳转 Jaeger 查看 trace
**So that** 可以监控 Brain 健康、排查 agent 调度异常

**验收标准：**
- [ ] 路径 `/admin/brain`（`src/app/[locale]/(dashboard)/admin/brain/page.tsx`），ADMIN 访问
- [ ] Tab 1「执行历史」：filter（日期范围、学生 ID 搜索、"仅 skipped"）+ 分页 Table（时间、学生、事件数、agents launched、skipped、耗时）。行展开看 details JSON。
- [ ] Tab 2「学生状态」：输入学生 ID → 展示最近 5 次 brain-run、当前 cooldown（读 Redis `brain:intervention-cooldown:{sid}` TTL）、下次 cron 时间（静态读 `SCHEDULE_REGISTRY`）
- [ ] Tab 3「统计」：最近 7 天总运行数、平均耗时、按 agentName 分布（CSS 横条）、skipped 原因 Top 5
- [ ] 历史行的 "agents launched" 列 hover 显示具体 agent 列表；点击跳 `/admin/agent-traces?userId=X&from=T&to=T+5min`
- [ ] `/admin/agent-traces/[traceId]` 顶部新增 Jaeger 链接（后端已构造好的 `jaegerUrl`；未配置 env 或 trace 无 otelTraceId 时，按钮 disabled + tooltip）
- [ ] Jaeger URL 构造在**后端**，前端零感知：env `JAEGER_UI_URL`（无 `NEXT_PUBLIC_` 前缀）
- [ ] 4 个 Agent handler（diagnosis / question-understanding / intervention-planning / mastery-evaluation）的 `agentTrace.create` 写入 `otelTraceId`；OTEL 未启用时为 null

**边界条件：**
- OTEL 未启用：`otelTraceId=null`，Jaeger 按钮 disabled
- `JAEGER_UI_URL` 未配置：同上（无论有无 traceId）
- Brain 从未运行过：列表为空，统计卡为 0
- 学生 ID 不存在：状态页提示 "学生不存在"

**性能要求：**
- 执行历史 query < 500ms（命中 `AdminLog.@@index([adminId, createdAt])`，AdminLog action 已索引组合）
- 统计查询 < 1s（7 天范围内 AdminLog 扫描可接受）

**Memory 写入清单：** N/A (admin UI)
**Brain 触发条件：** N/A (admin UI，只读 Brain 产出的 AdminLog + AgentTrace)

### tRPC 契约

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| brain.listRuns | `{ studentId?, dateFrom?, dateTo?, skippedOnly?, page, pageSize }` | `{ items, total }` 含学生 nickname | ADMIN |
| brain.studentStatus | `{ studentId }` | `{ recentRuns[], cooldownTTL, nextCronAt }` | ADMIN |
| brain.stats | `{ days }` | `{ totalRuns, avgDurationMs, agentDistribution, topSkippedReasons }` | ADMIN |

### Schema 变更

`AgentTrace`：新增 `otelTraceId String? @db.VarChar(32)` + `@@index([otelTraceId])`。

### 新 helper

- `src/lib/infra/telemetry/capture.ts` — `captureOtelTraceId(): string | null`
- `src/lib/infra/telemetry/jaeger-url.ts` — `buildJaegerUrl(traceId: string | null): string | null`

### 环境变量

- `JAEGER_UI_URL`（可选，示例 `http://localhost:16686`）；未配置时 Jaeger 链接 disabled

---

## US-058: AI 输出质量评估框架 (EvalFramework)

**As a** 管理员 / 工程团队
**I want to** 为每个 AIOperationType 维护 golden 数据集，并一键回归全部 AI 操作的输出质量
**So that** 当 prompt / provider / model / Skill 有改动时，能快速发现 AI 输出质量是否下降（correctness / completeness / safety）

**验收标准：**
- [ ] 路径 `/admin/eval`（`src/app/[locale]/(dashboard)/admin/eval/page.tsx`），ADMIN 访问
- [ ] 数据集目录 `tests/eval/datasets/`，每个 AIOperationType 对应一个 JSON 文件；13 op 全覆盖（9 个真实 cases + OCR_RECOGNIZE 结构就绪待素材 + 3 stub 标 `unavailableReason`）
- [ ] 评估维度：
  - `exactMatchFields`（结构化字段）逐字段 deep-equal，任一不匹配即 FAIL（短路，不调 AI 评判省成本）
  - `judgedFields`（自由文本字段）调 `EVAL_JUDGE` AI 操作打 1-5 分；score ≥ 3 为 PASS
- [ ] EvalRunner 支持三种用例状态：PASS / FAIL / ERROR（provider 异常）/ SKIPPED（unavailableReason 或素材缺失）
- [ ] 每次运行持久化：`EvalRun`（1 条 summary）+ `EvalCase[]`（每 case 1 条，含 input / expected / actual / judgeScore / judgeReasoning / failureReason / durationMs）
- [ ] 手动触发：Run All / Select Operations；enqueue BullMQ `eval-run` job 异步执行
- [ ] 详情页按 operation 分组显示 cases；默认折叠 PASS，展开 FAIL / ERROR；失败项展开完整 `input/expected/actual/judgeReasoning`
- [ ] 通过率计算：`passed / (total - skipped)`；Phase 3 验收基线 ≥ 80%
- [ ] 数据集加载在启动期做 Zod 校验；`cases: []` 且无 `unavailableReason` → 拒绝启动（避免运行时静默）
- [ ] `eval-judge` Skill 自身不参与自评（数据集标 `self-referential`）
- [ ] 触发动作写 AdminLog `action=eval-trigger`
- [ ] i18n：`admin.eval.*` 中英双语完整覆盖

**边界条件：**
- 数据集 JSON Schema 校验失败：启动期抛错，不启动 Worker / dev server
- EvalRun 状态为 RUNNING 超过 30 分钟：UI 标红"超时"（不自动清理，由管理员决定重跑）
- 同一 op 可以只跑单 op（数据集页行尾 "Run" 按钮）
- 非 ADMIN 访问任意 procedure：tRPC FORBIDDEN
- provider 调用抛错 → EvalCase = ERROR（不计入失败率，避免 provider 暂时问题污染基线）

**性能要求：**
- 数据集加载 < 500ms（冷启动全部 13 个 JSON）
- 单次 Run All（≈ 36-40 cases）受 LLM 调用限制，典型 3-6 分钟；UI 不阻塞，显示 RUNNING 状态
- EvalRun 列表 query < 500ms（命中 `EvalRun.@@index([startedAt])`）

**Memory 写入清单：** N/A（评估工具，不写学生 Memory）
**Brain 触发条件：** N/A（独立于 Brain，仅 admin 触发）

### tRPC 契约

| 接口 | 输入 | 输出 | RBAC |
|-----|------|------|------|
| eval.listRuns | `{ page, pageSize, status? }` | `{ items, total }` 含 triggerAdmin nickname | ADMIN |
| eval.getRun | `{ id }` | `{ run, cases: EvalCase[] }` | ADMIN |
| eval.trigger | `{ operations?: AIOperationType[] }` | `{ runId, jobId }` | ADMIN |
| eval.datasetStats | `{}` | `[{ operation, caseCount, unavailableReason?, lastRunStatus?, lastPassRate?, lastRunAt? }]` | ADMIN |

### Schema 变更

新增 `EvalRun` + `EvalCase` 模型（独立，不复用 AdminLog，因 AdminLog.details JSON 不适合大量结构化查询）。新增枚举 `EvalRunStatus`、`EvalCaseStatus`。`AIOperationType` 枚举无变更（`EVAL_JUDGE` 已存在，本 Sprint 把 registry stub 替换为真实 adapter）。

### 新 helper

- `src/lib/domain/ai/eval/eval-runner.ts` — 核心评估管道 `runEval(operations, adminId, deps)`
- `src/lib/domain/ai/eval/dataset-schema.ts` — 数据集 Zod schema + `loadDataset(op)`
- `src/lib/domain/ai/eval/compare.ts` — deep-equal helper（支持忽略字段顺序等配置）
- `src/lib/domain/ai/eval/types.ts` — `EvalRunResult` / `EvalCaseStatus` 等类型

### 新 AI 操作

- `EVAL_JUDGE`：输入 `{operation, operationDescription, expected, actual}`；输出 `{score: 1-5, passed: boolean, reasoning}`；prompt v1.0.0

### 新 Skill

- `eval-judge`：`ctx.callAI("EVAL_JUDGE", input)` 薄包装（预留未来 Agent 组合使用；EvalRunner 内部走 `callAIOperation` 直调，避免嵌套沙箱）

### 新 BullMQ Job

- `"eval-run"` — AIJobName union 追加；`EvalRunJobData { runId, operations, userId, locale }`；超时 900s；重试 0（失败即标 FAILED，由管理员决定重跑）

### Rule 8 溯源结论（3 个 stub）

- **WEAKNESS_PROFILE**：Sprint 11 走 `weakness-profile` Skill 直接经 Memory + `search_knowledge_points`，operation 层为预留接口，不是遗漏。数据集 `unavailableReason: "WEAKNESS_PROFILE 由 weakness-profile Skill 直接实现，不经 operation 层 — 见 Sprint 11 设计"`
- **FIND_SIMILAR**：`registry.ts:167-175` 注释明确非 AI op（deterministic dual-path retrieval）。数据集 `unavailableReason: "deterministic dual-path retrieval (KP + pgvector), not an AI operation"`
- **EVAL_JUDGE**：自评无意义。数据集 `unavailableReason: "self-referential — not evaluated by itself"`
