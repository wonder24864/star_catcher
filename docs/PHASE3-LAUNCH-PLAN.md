# Phase 3 启动计划

> Phase 2 回顾 + Phase 3 开发方式调整 + Sprint 规划

---

## 一、Phase 2 回顾

### 保留的好做法

- **1 周 Sprint + 5-7 任务**：Sprint 4a-9 共 7 个 Sprint，节奏可控，每个 Sprint 有独立交付物
- **逐 Sprint 递进文档**：用户故事和 ADR 在 Sprint 开始时才写，避免 Phase 1 中"预写后大改"
- **改代码立即跑测试**：Phase 2 结束时 718 tests passed，断言漂移问题大幅减少
- **Skill 插件 IPC 沙箱**：完整隔离执行 + Schema Adapter 多 Provider 兼容 + 管理员可视化
- **Agent Runner function calling 循环**：AgentRunner + StepLimiter + CostTracker + AgentTrace 审计链，新 Agent 只需定义 AgentDefinition
- **Student Memory 层**：状态机转换验证 + SM-2 算法 + processReviewResult 完整实现

### 暴露的问题

| 问题 | 表现 | 根因 | Phase 3 对策 |
|------|------|------|-------------|
| Skill 落地缺口 | Sprint 9 专门补 4 个缺口 | 规划时低估 Skill 系统工程量 | 每个 Sprint 末尾包含集成验证任务 |
| SemanticCache 只做 Spike | pgvector 验证通过但未集成 | 优先级排序中被不断推迟 | Sprint 10a 明确纳入 |
| 推迟事项堆积 | D1-D8 共 8 项推迟 | Phase 2 范围本身已大 | 逐项评估，D1/D2/D4/D5/D6/D7/D8 全部纳入（仅 D3 推迟） |

---

## 二、开发流程调整（3 条）

### 2.1 Sprint 内集成验证（不留缺口）

Phase 2 的 Skill 系统在 Sprint 4a/4b 搭建，直到 Sprint 9 才发现 4 个落地缺口。

**新做法**：每个 Sprint 最后一个任务是"集成验证" — 确认本 Sprint 交付物与已有系统的连接点全部畅通。不允许"基础设施已搭建但未启用"跨 Sprint。

### 2.2 BullMQ 定时任务 + Handler Registry

Phase 1-2 的 BullMQ 全部是用户触发的一次性任务，Worker 用 switch 路由 job。Phase 3 新增定时调度 + 更多 job 类型。

**两项改进**：

1. **Handler Registry 替代 switch**：`src/worker/index.ts` 的 switch 语句重构为 `Record<AIJobName, JobHandler>` 注册表。新增 job 只需添加一行映射，不改路由逻辑。与现有 SkillRegistry / OperationRegistry 模式一致。

2. **RepeatableJob 声明式注册**：定义 `SCHEDULE_REGISTRY` 声明所有定时任务（job name + cron + options），Worker 启动时遍历 registry 自动注册 `queue.add(name, {}, { repeat: { pattern } })`。不引入 node-cron / agenda，复用 BullMQ v5 的 repeat API。

```typescript
// src/lib/infra/queue/schedule-registry.ts
export const SCHEDULE_REGISTRY = [
  { name: "learning-brain", pattern: "0 6 * * *", attempts: 1, timeout: 300_000 },
  { name: "weakness-profile", pattern: "0 3 * * 0", attempts: 2, timeout: 120_000 },
] as const;
```

### 2.3 AgentDefinition Memory Interceptor（类型安全写入审计）

Phase 2 的 AgentDefinition 声明了 `allowedSkills` 和 `termination`，但 Memory 写入没有声明和审计机制。Phase 3 新增 Agent 会频繁写入 Memory（MasteryState 转换、复习调度、干预记录），需要可追溯、可验证。

**新机制**：AgentDefinition 接口新增 `memoryWriteManifest` 字段（声明该 Agent 允许的 Memory 写入方法列表）+ `MemoryWriteInterceptor` 钩子（pre/post write 拦截）。

```typescript
// AgentDefinition 新增字段
interface AgentDefinition {
  // ...existing: name, systemPrompt, allowedSkills, termination, modelConfig
  memoryWriteManifest: string[];   // 允许的 Memory 写方法白名单
  memoryInterceptor?: {
    onBeforeWrite?(method: string, data: unknown, ctx: AgentRunContext): Promise<void>;
    onAfterWrite?(method: string, data: unknown, ctx: AgentRunContext): Promise<void>;
  };
}
```

- IPC handler 的 `onWriteMemory` 在执行前校验 method 是否在 manifest 白名单中
- 不在白名单的写入直接拒绝（类似 allowedSkills 对 Skill 的约束）
- 拦截器可用于记录审计日志、验证状态转换合法性
- 与 allowedSkills 模式一致：声明式约束 + 运行时强制

---

## 三、推迟事项纳入决策

| # | 事项 | 决策 | Sprint | 纳入理由 |
|---|------|------|--------|---------|
| D1 | 三层薄弱分析（定期+全局） | **纳入** | Sprint 11 | 实时层(30天)已有，定期/全局是 Brain 数据源。BullMQ 定时任务周期性扫描 MasteryState + InterventionHistory，结果写入 WeaknessProfile |
| D2 | 年级过渡策略 | **纳入** | Sprint 11 | 与薄弱分析同处理。学段跨越时 MasteryState 标记 `archived=true`，回溯旧学段 KP 时标记 `foundationalWeakness` |
| D4 | SemanticCache 集成 | **纳入** | Sprint 10a | Spike 已通过，是 Brain 性能基础。Harness 管道新增 SemanticCache 组件 |
| D5 | ObservabilityTracer (OpenTelemetry) | **纳入** | Sprint 10a | Phase 3 新增 Brain->Agent->Skill 多级调用链，需完整分布式 trace 支撑调试和监控 |
| D6 | EvalFramework (AI 质量评估) | **纳入** | Sprint 16 | Phase 3 新增 4 个 AI 操作，需标注数据集+评估管道保障输出质量。单独 Sprint 处理 |
| D7 | KG 拖拽调整层级 | **纳入** | Sprint 15 | 后端 update(parentId) 已支持，前端引入 dnd-kit 即可。与 D8 管理 UI 同 Sprint |
| D8 | 低置信度映射管理员确认 | **纳入** | Sprint 15 | confidence 字段和 mappingSource 枚举已就绪，只需管理员 UI 筛选+批量确认 |
| D3 | 教材多版本管理 | **继续推迟** | Phase 5 | 需 KG schema 扩展（版本字段+版本间映射），Phase 3 不涉及教材管理 |

---

## 四、模块划分

Phase 3 围绕"学习闭环"实现 6 个模块：

| 模块 | 职责 | 核心新增 |
|------|------|---------|
| **A. 事件系统 + Learning Brain** | 事件驱动全局编排器 | BullMQ repeatable job + Brain orchestrator + Redis lock |
| **B. 薄弱分析增强** | 三层分析 + 年级过渡 | WeaknessProfile 模型 + 定期/全局 Skill + 学段归档 |
| **C. 干预规划** | AI 规划学习策略 | Intervention Planning Agent + DailyTask 模型 + 任务打包 |
| **D. 练习与讲解** | 类似题检索 + 讲解卡 | SemanticCache + find-similar-questions Skill + 讲解卡组件 |
| **E. 掌握评估** | 复习后重新评估 | Mastery Evaluation Agent + 评估闭环 + SM-2 增强 |
| **F. 管控与收尾** | 家长控制 + 管理验证 + 集成 | ParentStudentConfig 扩展 + D8 管理员 UI + 全量验收 |

模块依赖：

```
A (事件系统+ObservabilityTracer) -> C (干预规划) -> D (练习讲解)
A (事件系统) -> E (掌握评估)
B (薄弱分析) -> A (作为 Brain 数据源)
D4 (SemanticCache) + D5 (ObservabilityTracer) 在 Sprint 10a 与 A 同期
F (管控+D7+D8) 在 Sprint 15
G (EvalFramework) 在 Sprint 16 收尾
```

---

## 五、Sprint 规划框架

### Sprint 10a: SemanticCache + ObservabilityTracer 基础设施 (Week 14)

**目标**：搭建 Phase 3 基础设施前半 — SemanticCache 集成 + OpenTelemetry 观测 + BullMQ Handler/Schedule Registry 重构。

| # | 任务 | 产出 |
|---|------|------|
| 89 | Sprint 10a 用户故事 + Sprint 文件 | US-044 (SemanticCache 集成)、US-045 (ObservabilityTracer) |
| 90 | DB 迁移：新增模型 + 字段扩展 | Prisma migration（详见§八 DB 模型设计） |
| 91 | SemanticCache Harness 组件 | SemanticCache 接入 Harness 管道；pgvector 启用（`CREATE EXTENSION vector`）；docker-compose 切换 `pgvector/pgvector:pg16` 镜像 |
| 92 | ObservabilityTracer Harness 组件 | OpenTelemetry SDK 集成；Harness 管道新增 ObservabilityTracer 组件；AI 调用链完整 trace span；导出到 Jaeger（Docker 新增 jaeger 服务） |
| 93 | BullMQ Handler Registry + Schedule Registry + 新 job types | Worker switch -> `JOB_HANDLERS` 注册表；新增 `SCHEDULE_REGISTRY` 声明式定时任务；新增 6 个 AIOperationType 枚举值 + 4 个 job type |
| 94 | Sprint 10a 集成验证 | SemanticCache 端到端（embedding 写入+查询）；OTel span 在 Jaeger 可视化；Handler Registry 路由所有现有 job；npm test + tsc --noEmit |

**设计要点**：
- SemanticCache：Harness 管道新组件，基于 pgvector brute-force（Spike 验证 < 50ms @ 5000 条）
- ObservabilityTracer：`@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`；Harness 每个组件 wrap 一个 span（name=组件名, attributes={operationType, userId, tokens}）；AgentRunner 每步一个 child span；docker-compose 新增 Jaeger all-in-one（端口 16686 UI / 4318 OTLP）
- Handler Registry：`Record<AIJobName, JobHandler>` 替代 switch，与 SkillRegistry / OperationRegistry 模式一致
- Schedule Registry：`SCHEDULE_REGISTRY` 数组声明所有 repeatable jobs，Worker 启动时遍历注册

### Sprint 10b: Learning Brain 编排器 (Week 15)

**目标**：搭建 Learning Brain 事件驱动编排器 — 核心调度逻辑 + AgentDefinition memoryWriteManifest 机制。

| # | 任务 | 产出 |
|---|------|------|
| 95 | Sprint 10b 用户故事 + Sprint 文件 | US-046 (Learning Brain 事件调度) |
| 96 | AgentDefinition memoryWriteManifest + MemoryWriteInterceptor | AgentDefinition 接口扩展；IPC handler 校验 Memory 写入白名单；拦截器钩子（pre/post write） |
| 97 | Learning Brain BullMQ 定时任务 | Schedule Registry 注册 `learning-brain` cron `0 6 * * *`；Redis `SETNX brain:student:{id}` TTL 5min |
| 98 | Learning Brain orchestrator 核心 | `src/lib/domain/brain/learning-brain.ts`：读 Memory -> 判断需哪些 Agent -> enqueue jobs -> AdminLog 记录 |
| 99 | Sprint 10b 集成验证 | Brain cron 触发 + 骨架日志验证；memoryWriteManifest 对现有 Agent 生效；npm test + tsc --noEmit |

**设计要点**：
- Learning Brain **不是** Agent，是**确定性编排逻辑**（纯代码 if/else + DB 查询），不调用 AI
- Brain 每次运行扫描一个学生，通过 Redis lock 保证不并发
- Brain 的输出是 BullMQ jobs（`intervention-planning`, `mastery-evaluation`），不直接执行 Agent
- memoryWriteManifest 对现有 Agent（question-understanding, diagnosis）追加声明，确保机制生效

### Sprint 11: 薄弱分析增强 + 年级过渡 (Week 16)

**目标**：三层薄弱分析（定期+全局）+ 年级过渡策略，为 Intervention Planning 提供数据基础。

| # | 任务 | 产出 |
|---|------|------|
| 100 | Sprint 11 用户故事 + Sprint 文件 | US-047 (三层薄弱分析)、US-048 (年级过渡策略) |
| 101 | weakness-profile Skill | `skills/weakness-profile/`：定期分析（学期内 MasteryState 聚合）+ 全局分析（全历史跨学期），输出 WeaknessProfile JSON |
| 102 | 定期/全局分析 BullMQ 任务 | 定期分析：Schedule Registry 注册每周一次。全局分析：学期末手动触发。结果写入 WeaknessProfile |
| 103 | 年级过渡逻辑 | MasteryState `archived` 字段。学段跨越时批量归档。新错题回溯旧学段 KP 时 InterventionHistory 标记 `foundationalWeakness` |
| 104 | Memory 层扩展 | StudentMemoryImpl 新增：`getWeaknessProfile()`, `archiveMasteryBySchoolLevel()`, `checkFoundationalWeakness()` |
| 105 | Brain 集成薄弱数据 | Brain 编排逻辑中新增：读取 WeaknessProfile -> 趋势恶化时触发 Intervention Agent |
| 106 | Sprint 11 集成验证 | 三层分析端到端，年级过渡场景测试，npm test + tsc --noEmit |

**设计要点**：
- WeaknessProfile 模型：`{ studentId, tier: REALTIME|PERIODIC|GLOBAL, data: JSONB, generatedAt, validUntil }`
- 定期分析只看当前学期（按 createdAt 时间窗口），全局分析看全历史
- 年级过渡不删数据，只设 archived。已归档 MasteryState 不参与实时分析和 SM-2 调度

### Sprint 12: 干预规划 Agent + 今日任务包 (Week 17)

**目标**：Intervention Planning Agent + Daily Task 数据模型 + 学生任务 UI。

| # | 任务 | 产出 |
|---|------|------|
| 107 | Sprint 12 用户故事 + Sprint 文件 | US-049 (干预规划 Agent)、US-050 (今日任务包) |
| 108 | Intervention Planning Agent 定义 | `src/lib/domain/agent/definitions/intervention-planning.ts`：allowedSkills (weakness_profile, search_knowledge_points, generate_daily_tasks), maxSteps: 8, memoryWriteManifest: ["logIntervention"] |
| 109 | generate-daily-tasks Skill | `skills/generate-daily-tasks/`：根据薄弱分析 + 复习调度 + 家长 maxDailyTasks，AI 生成任务列表（REVIEW / PRACTICE / EXPLANATION） |
| 110 | Daily Task Router + API | `src/server/routers/daily-task.ts`：todayTasks / completeTask / taskHistory。STUDENT + PARENT 权限 |
| 111 | 今日任务包 UI | `src/app/[locale]/(dashboard)/tasks/page.tsx`：TaskCard 列表（三种卡片样式）+ 完成打勾 + 进度条 |
| 112 | intervention-planning BullMQ handler | `src/worker/handlers/intervention-planning.ts`：JOB_HANDLERS 注册 -> 运行 Agent -> 结果写入 DailyTaskPack + DailyTask |
| 113 | Sprint 12 集成验证 | Brain -> Intervention Agent -> DailyTask 写入 -> 学生 API 读取，端到端。npm test + tsc --noEmit |

**设计要点**：
- DailyTaskPack: `{ studentId, date (@@unique per student+date), status: PENDING|IN_PROGRESS|COMPLETED, totalTasks, completedTasks }`
- DailyTask: `{ packId, type: REVIEW|PRACTICE|EXPLANATION, knowledgePointId, questionId?, content: JSONB, status: PENDING|COMPLETED, completedAt?, sortOrder }`
- Brain cron 时读取 `ParentStudentConfig.maxDailyTasks`，传给 Agent 作为约束
- Agent 不直接写 DailyTask — Agent 输出任务计划 JSON，handler 代码解析后写入 DB

### Sprint 13: 类似题检索 + 讲解卡 (Week 18)

**目标**：类似题推荐 + 多格式讲解卡，丰富任务包内容质量。同时覆盖 REQUIREMENTS S11 讲解卡三格式 + 渐进展示增强。

| # | 任务 | 产出 |
|---|------|------|
| 114 | Sprint 13 用户故事 + Sprint 文件 | US-051 (类似题检索)、US-052 (讲解卡 + 渐进展示增强) |
| 115 | find-similar-questions Skill | `skills/find-similar-questions/`：双路检索 — KP 维度（同 KP 其他错题）+ pgvector cosine similarity on ErrorQuestion.embedding |
| 116 | ErrorQuestion embedding 生成 | BullMQ 后台任务：新错题入库后异步生成 embedding（text-embedding-3-small），写入 ErrorQuestion.embedding |
| 117 | generate-explanation-card Skill | `skills/generate-explanation-card/`：AI 生成讲解卡（static / interactive / conversational 三种格式） |
| 118 | 讲解卡 UI 组件 | `src/components/explanation-card.tsx`：StaticCard（Markdown + KaTeX）、InteractiveCard（分步展开+答题）、ConversationalCard（对话 Q&A） |
| 119 | 类似题展示 + 练习流程 | PRACTICE 卡片：展示类似题 -> 学生作答 -> AI 判分 -> 更新 MasteryState |
| 120 | Sprint 13 集成验证 | 类似题端到端（embedding 生成 -> pgvector 查询 -> 展示），讲解卡三格式渲染。npm test + tsc --noEmit |

**设计要点**：
- ErrorQuestion 新增 `embedding` 列（`Unsupported("vector(1536)")?`），与 KnowledgePoint 同模式
- 双路检索合并去重：(1) 知识点维度 — 同 KP 下其他错题；(2) 内容维度 — pgvector cosine on embedding
- 讲解卡格式由 AI 自动选：小学低年级默认 interactive，高中默认 static
- ExplanationCard: `{ format: 'static'|'interactive'|'conversational', title, steps: Array<{content, question?, expectedAnswer?}>, metadata }`

### Sprint 14: 掌握评估 Agent + 闭环完成 + 家长控制 (Week 19)

**目标**：Mastery Evaluation Agent + 闭环最后一环 + 家长学习控制面板。

| # | 任务 | 产出 |
|---|------|------|
| 121 | Sprint 14 用户故事 + Sprint 文件 | US-053 (掌握评估 Agent)、US-054 (家长学习控制) |
| 122 | Mastery Evaluation Agent 定义 | `src/lib/domain/agent/definitions/mastery-evaluation.ts`：allowedSkills (evaluate_mastery, get_intervention_history, search_knowledge_points), maxSteps: 6, memoryWriteManifest: [] |
| 123 | evaluate-mastery Skill | `skills/evaluate-mastery/`：综合分析复习结果+练习表现+干预历史 -> 输出评估报告+建议 MasteryState 转换 |
| 124 | SM-2 增强：AI 混合调度 | 新增 `calculateHybridReview`：SM-2 基础值 + AI 调整因子（错误类型/历史掌握速度/工作量/考试临近度） |
| 125 | 学习闭环自动化 | DailyTask 完成 -> mastery-evaluation BullMQ job -> Agent -> 输出建议 -> handler 验证后写 Memory -> 下次 Brain 纳入 |
| 126 | 家长学习控制 UI | `src/app/[locale]/(dashboard)/parent/settings/learning/page.tsx`：每日任务上限 slider、学习时段 time picker、操作日志 |
| 127 | Sprint 14 集成验证 | **完整闭环端到端**：新错题 -> Brain -> 诊断 -> 干预 -> 任务生成 -> 完成 -> 评估 -> 状态更新 -> Brain 下一轮。npm test + tsc --noEmit |

**设计要点**：
- Mastery Evaluation Agent 不直接修改 MasteryState，输出建议（recommended transitions）。Handler 验证后调 Memory 层执行
- SM-2 增强参数：`{ errorType: 'calculation'|'concept'|'careless'|'method', masterySpeed: number, currentWorkload: number, examProximityDays?: number }`
- 闭环触发链：DailyTask.status=COMPLETED -> tRPC mutation -> enqueue `mastery-evaluation` -> Agent -> Memory update

### Sprint 15: 管理员 UI (D7 + D8) + Brain 监控 (Week 20)

**目标**：D8 低置信度映射管理确认 + D7 KG 拖拽层级调整 + Brain 管理监控。

| # | 任务 | 产出 |
|---|------|------|
| 128 | Sprint 15 用户故事 + Sprint 文件 | US-055 (低置信度映射管理确认)、US-056 (KG 拖拽调整) |
| 129 | 低置信度映射管理页面 | `src/app/[locale]/(dashboard)/admin/knowledge-graph/mappings/page.tsx`：筛选 confidence < 0.7 -> 列表（题目+KP+置信度）-> 批量确认/修正/删除 |
| 130 | knowledge-graph router 扩展 | `listLowConfidenceMappings`, `batchVerifyMappings`, `updateMapping` procedures, ADMIN only |
| 131 | KG 拖拽调整层级 | 安装 @dnd-kit/core + @dnd-kit/sortable；KG 管理页面添加拖拽排序和层级调整功能；调用已有 `update(parentId)` 后端 API |
| 132 | Learning Brain 监控页面 | `src/app/[locale]/(dashboard)/admin/brain/page.tsx`：Brain 执行历史、学生级状态、Agent 调度统计、Jaeger trace 链接 |
| 133 | Sprint 15 集成验证 | 低置信度筛选+批量确认端到端；KG 拖拽层级变更端到端；Brain 监控页数据展示。npm test + tsc --noEmit |

### Sprint 16: EvalFramework + 全量集成测试 + Phase 3 收尾 (Week 21)

**目标**：D6 AI 输出质量评估框架 + 全量集成测试 + Phase 3 验收。

| # | 任务 | 产出 |
|---|------|------|
| 134 | Sprint 16 用户故事 + Sprint 文件 | US-057 (EvalFramework) |
| 135 | 标注数据集创建 | 为每个 AIOperationType（共 13 个）创建 golden test cases（每个 3-5 条）：输入数据 + 期望输出 + 评估维度（correctness/completeness/safety）。存放在 `tests/eval/datasets/` |
| 136 | EvalRunner 评估管道 | `src/lib/domain/ai/eval/eval-runner.ts`：加载标注数据集 -> 对每条数据调用 AI 操作 -> 与期望输出对比（结构化字段精确匹配 + 自由文本 AI 评判）-> 输出评分报告 JSON |
| 137 | AI 评判 Skill：eval-judge | `skills/eval-judge/`：使用 AI 对比 actual vs expected 自由文本输出，打分 1-5 + 给出评估理由。AIOperationType 新增 `EVAL_JUDGE` |
| 138 | 质量报告页面 | `src/app/[locale]/(dashboard)/admin/eval/page.tsx`：评估运行列表 + 每次运行的详细报告（按操作类型分组、通过率、失败案例详情）|
| 139 | 全量集成测试 + 闭环场景 | 完整闭环自动化测试 + 边界（Brain 并发锁、Agent 超步数、空数据、EvalRunner 回归） |
| 140 | Phase 3 验收 + 文档同步 | ROADMAP Sprint 10a-16 状态、README 目录树、CLAUDE.md 规则更新（Rule 8/9）、Phase 3 验收摘要 |

---

## 六、设计决策记录

| # | 决策 | 选择 | 候选方案 | 选择原因 |
|---|------|------|---------|---------|
| D11 | Learning Brain 实现 | BullMQ RepeatableJob + 确定性代码 | DB trigger / CDC / Agent 自主编排 | BullMQ 已有完整基础设施。Brain 是确定性逻辑不需 AI，用 Agent 浪费 token |
| D12 | Brain 触发频率 | 每日 1 次 cron `0 6 * * *` | 实时事件 / 每小时 | Solo dev 优先简单可靠。每日一次覆盖"复习到期"和"任务打包"。新错题诊断已在 Phase 2 由用户操作触发 |
| D13 | Brain 并发控制 | Redis SETNX per-student, TTL 5min | PostgreSQL advisory lock / BullMQ 队列限流 | Redis 已在栈中，SETNX 最简。TTL 防死锁。学生间天然并行 |
| D14 | DailyTaskPack 模型 | 独立模型 | JSON 嵌 MasteryState / 复用 InterventionHistory | 任务包有独立生命周期（生成->进行中->完成），需独立状态管理 |
| D15 | 类似题检索 | 双路：KP 维度 + pgvector embedding | 纯 KP / 纯 embedding / 外部搜索 | KP 保证知识相关，embedding 补内容相似。两路合并去重 |
| D16 | 讲解卡格式选择 | AI 自动选（基于年级+难度） | 用户手动选 / 固定格式 | K-12 跨度大，AI 判断更灵活。用户可在设置覆盖 |
| D17 | Mastery Eval 写入权限 | Agent 输出建议，handler 验证后写 Memory | Agent 直接写 Memory | 保持 Memory 层唯一写入点（ADR-010）。Agent 可能输出不合理建议 |
| D18 | SM-2 增强 | 保留 SM-2 + AI 调整因子 | 完全替换 SM-2 / 不增强 | SM-2 作为稳定基线。AI 根据额外因素输出乘数调整 interval，可回退纯 SM-2 |
| D19 | SemanticCache | Harness 管道组件，pgvector brute-force | Redis 向量缓存 / 应用层内存 | Spike 确认 < 50ms @ 5000 条，复用现有 PostgreSQL |
| D20 | 年级过渡 | MasteryState archived 标记 | 物理删除 / 迁移归档表 | 不丢数据，旧数据可追溯。archived 不参与活跃调度 |
| D21 | ObservabilityTracer 实现 | OpenTelemetry SDK + Jaeger | Datadog / Grafana Tempo / 自研 | Jaeger 免费开源，Docker all-in-one 镜像易部署。OTel 是行业标准，未来可切换后端 |
| D22 | EvalFramework 实现 | 标注数据集 + AI 评判 | 纯规则匹配 / 人工评审 / 第三方 eval 平台 | 结构化字段用规则匹配，自由文本用 AI 评判。兼顾精确和灵活。每个操作 3-5 条 golden cases 足够做回归 |
| D23 | KG 拖拽库 | @dnd-kit/core + sortable | react-beautiful-dnd / react-dnd / 自研 | dnd-kit 体积小、API 现代、支持树形结构、维护活跃。react-beautiful-dnd 已停止维护 |

---

## 七、工程机制调整（2 条）

### 7.1 用户故事格式扩展

Phase 3 Agent 的用户故事在 Phase 2 模板基础上新增：

```markdown
**Memory 写入清单**:
- 方法名: 写入内容说明
- 方法名: 写入内容说明

**Brain 触发条件**（仅 Brain 相关 US）:
- 触发事件: 执行动作
```

### 7.2 CLAUDE.md 新增规则

**Rule 8: Learning Brain 纪律**
- Brain 是确定性代码，不调用 AI Provider
- Brain 执行必须持有 per-student Redis lock
- Agent 输出的 Memory 写入建议须经 Brain/handler 验证后执行
- Brain 日志写入 AdminLog，action=`brain-run`

**Rule 9: Handler Registry + Schedule Registry**
- Worker job 路由使用 `JOB_HANDLERS` 注册表，禁止 switch
- 定时任务声明在 `SCHEDULE_REGISTRY`，Worker 启动时自动注册
- 新增 job 只加映射，不改路由代码

---

## 八、DB 模型设计（Sprint 10a 迁移）

### 新增模型

```prisma
// 今日任务包
enum DailyTaskPackStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
}

model DailyTaskPack {
  id             String              @id @default(cuid())
  studentId      String
  date           DateTime            @db.Date
  status         DailyTaskPackStatus @default(PENDING)
  totalTasks     Int                 @default(0)
  completedTasks Int                 @default(0)
  createdAt      DateTime            @default(now()) @db.Timestamptz
  updatedAt      DateTime            @updatedAt @db.Timestamptz

  student User        @relation("StudentDailyPacks", fields: [studentId], references: [id])
  tasks   DailyTask[]

  @@unique([studentId, date])
  @@index([studentId, status])
}

// 单个任务项
enum DailyTaskType {
  REVIEW
  PRACTICE
  EXPLANATION
}

enum DailyTaskStatus {
  PENDING
  COMPLETED
}

model DailyTask {
  id               String          @id @default(cuid())
  packId           String
  type             DailyTaskType
  knowledgePointId String
  questionId       String?         // 关联的错题（REVIEW/PRACTICE 时）
  content          Json?           // 任务详情
  status           DailyTaskStatus @default(PENDING)
  completedAt      DateTime?       @db.Timestamptz
  sortOrder        Int             @default(0)
  createdAt        DateTime        @default(now()) @db.Timestamptz

  pack           DailyTaskPack  @relation(fields: [packId], references: [id], onDelete: Cascade)
  knowledgePoint KnowledgePoint @relation(fields: [knowledgePointId], references: [id])
  question       ErrorQuestion? @relation(fields: [questionId], references: [id])

  @@index([packId, sortOrder])
  @@index([knowledgePointId])
}

// 薄弱分析快照
enum WeaknessTier {
  REALTIME   // 实时（30天）- Phase 2 已有逻辑，此处存储快照
  PERIODIC   // 定期（学期内）
  GLOBAL     // 全局（全历史）
}

model WeaknessProfile {
  id         String       @id @default(cuid())
  studentId  String
  tier       WeaknessTier
  data       Json         // { weakPoints: [{kpId, severity, trend, errorCount}], summary }
  generatedAt DateTime    @db.Timestamptz
  validUntil  DateTime?   @db.Timestamptz
  createdAt  DateTime     @default(now()) @db.Timestamptz

  student User @relation("StudentWeakness", fields: [studentId], references: [id])

  @@index([studentId, tier, generatedAt])
}
```

### 现有模型字段扩展

```prisma
// ParentStudentConfig 新增字段
model ParentStudentConfig {
  // ... existing fields ...
  maxDailyTasks     Int      @default(10)    // 每日最大任务数
  learningTimeStart String?  @db.VarChar(5)  // HH:MM 格式
  learningTimeEnd   String?  @db.VarChar(5)  // HH:MM 格式
}

// MasteryState 新增字段
model MasteryState {
  // ... existing fields ...
  archived Boolean @default(false) // 年级过渡归档
  // 新增索引
  @@index([studentId, archived, status])
}

// ErrorQuestion 新增字段（Sprint 13）
model ErrorQuestion {
  // ... existing fields ...
  embedding Unsupported("vector(1536)")? // pgvector embedding for similarity search
}

// AIOperationType 新增枚举值
enum AIOperationType {
  // ... existing values ...
  WEAKNESS_PROFILE
  INTERVENTION_PLAN
  MASTERY_EVALUATE
  FIND_SIMILAR
  GENERATE_EXPLANATION
  EVAL_JUDGE           // Sprint 16: AI 评判输出质量
}

// InterventionType 新增枚举值
enum InterventionType {
  // ... existing values ...
  PRACTICE       // 练习
  BRAIN_DECISION // Brain 编排决策记录
}
```

---

## 九、新增 Agent / Skill / BullMQ Job 总览

### 新增 Agent（2 个）

| Agent | 触发方式 | allowedSkills | maxSteps | maxTokens | memoryWriteManifest |
|-------|---------|---------------|----------|-----------|---------------------|
| intervention-planning | Brain enqueue | weakness_profile, search_knowledge_points, generate_daily_tasks | 8 | 15000 | ["logIntervention"] |
| mastery-evaluation | DailyTask 完成后 enqueue | evaluate_mastery, get_intervention_history, search_knowledge_points | 6 | 10000 | [] (输出建议，handler 验证后写入) |

### 新增 Skill（5 个）

| Skill | 来源 | 核心能力 | AI 操作类型 |
|-------|------|---------|------------|
| generate-daily-tasks | Intervention Planning Agent | 根据薄弱分析+复习调度+家长配置生成任务列表 | INTERVENTION_PLAN |
| find-similar-questions | Intervention Planning Agent / 独立 | pgvector + KP 双路类似题检索 | FIND_SIMILAR |
| generate-explanation-card | 今日任务流程 | 三格式讲解卡生成 | GENERATE_EXPLANATION |
| evaluate-mastery | Mastery Evaluation Agent | 综合评估掌握度，输出转换建议 | MASTERY_EVALUATE |
| eval-judge | EvalRunner | AI 对比 actual vs expected 输出，打分+理由 | EVAL_JUDGE |

### 新增 BullMQ Job Types（4 个）

| Job Name | 触发 | 超时 | 重试 | 队列 |
|----------|------|------|------|------|
| learning-brain | RepeatableJob cron | 300s | 1 | ai-jobs |
| weakness-profile | RepeatableJob 每周 / 手动 | 120s | 2 | ai-jobs |
| intervention-planning | Brain enqueue | 60s | 2 | ai-jobs |
| mastery-evaluation | tRPC mutation enqueue | 30s | 1 | ai-jobs |

---

## 十、前置工作清单

以下在 Sprint 10a 开始前完成（预计 1-2 天）：

- [ ] 阅读 ADR-011 全文 + ARCHITECTURE.md S6.5，确认方向一致
- [ ] docker-compose.yml 切换 `postgres:16-alpine` -> `pgvector/pgvector:pg16`
- [ ] 验证 `CREATE EXTENSION IF NOT EXISTS vector` 可执行
- [ ] 设计并确认 Prisma schema 增量（本文S八）
- [ ] 确认 BullMQ RepeatableJob API：`Queue.upsertJobScheduler(id, { pattern: '0 6 * * *' }, { name, data })`
- [ ] 更新 CLAUDE.md 新增 Rule 8/9
- [ ] 确认现有 11 个 Skill 全部 ACTIVE 可用
- [ ] 设计 Brain 执行日志格式：AdminLog action=`brain-run`, details JSON
- [ ] 确认 Docker 可拉取 Jaeger all-in-one 镜像 (`jaegertracing/all-in-one:latest`)
- [ ] 评估 @dnd-kit/core 包大小和 tree 兼容性

---

## 十一、Phase 3 验收标准

Phase 3 结束（Sprint 16, Week 21）时：

1. **闭环完整性**：新错题 -> 诊断 -> 薄弱分析 -> 干预规划 -> 任务生成 -> 学生完成 -> 掌握评估 -> 状态更新，全链路自动化
2. **Learning Brain 运行**：BullMQ cron 每日执行，扫描所有活跃学生
3. **今日任务包**：学生看到个性化任务列表，完成后状态自动更新
4. **类似题检索**：pgvector 查询 < 100ms
5. **讲解卡**：static / interactive / conversational 三格式正确渲染
6. **家长控制**：maxDailyTasks + learningTime 设置生效，Brain 遵守
7. **管理员验证**：低置信度 mapping 筛选 + 批量确认正常
8. **KG 拖拽**：知识图谱层级可通过拖拽调整
9. **可观测性**：Brain->Agent->Skill->AI 完整 trace 在 Jaeger 可查看
10. **AI 质量评估**：EvalRunner 对所有 AIOperationType 跑 golden test cases，质量报告页面可查看
11. **测试覆盖**：新增测试覆盖所有 Agent / Skill / Brain / Eval，npm test 全量通过
