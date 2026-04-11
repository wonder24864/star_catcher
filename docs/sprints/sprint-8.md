# Sprint 8: Parent Reports v1 + Agent Trace 可视化 + Phase 2 收尾 (Week 12)

## 目标

Phase 2 收官 Sprint。基于已完成的 Agent 执行链路和 Student Memory 数据，交付家长学习报告（知识点维度）、Agent Trace 管理员可视化、家长/学生 AI 分析简化视图，并完成 Phase 2 全量验收。

## 用户故事范围

- US-041: 家长周报/月报 — 知识点维度的进步趋势 + 薄弱分析
- US-042: Agent Trace 管理员视图 — 完整 trace 时序图（调用链 + 耗时 + Token）
- US-043: Agent 分析简化视图 — 家长/学生看到 AI 分析本地化摘要

## 任务清单

### Week 12

- [x] 73. US-041~043 用户故事 + Sprint 文件
  - 用户故事文档 `docs/user-stories/parent-reports.md` (US-041)
  - 用户故事文档 `docs/user-stories/agent-trace-views.md` (US-042, US-043)
  - Sprint 文件 `docs/sprints/sprint-8.md`
  - 更新 `docs/user-stories/_index.md` 和 `docs/ROADMAP.md`
  - 产出：文档

- [x] 74. Report Router — 家长报告数据聚合
  - 新增 `src/server/routers/report.ts`
  - weeklyReport / monthlyReport / knowledgeProgress tRPC procedures
  - 数据源: MasteryState + InterventionHistory + ReviewSchedule + KnowledgePoint
  - 权限: PARENT + STUDENT，复用 resolveStudentId 模式
  - 产出：router 代码 + 单元测试

- [x] 75. Parent Report UI — 周报/月报页面
  - 新增 `src/app/[locale]/(dashboard)/parent/reports/page.tsx`
  - ReportSummaryCard + MasteryTrendChart + WeakPointsTable + ReviewCompletionCard
  - 7d/30d 切换 + 学生选择器 + 空状态
  - i18n report namespace + parent sidebar 导航
  - 产出：页面 + 组件 + i18n

- [x] 76. Agent Trace Admin Router
  - 新增 `src/server/routers/agent-trace.ts`
  - list / detail / stats tRPC procedures
  - 权限: ADMIN only
  - 产出：router 代码 + 单元测试

- [x] 77. Agent Trace Admin UI — 时序图 + 步骤详情
  - 列表页: `src/app/[locale]/(dashboard)/admin/agent-traces/page.tsx`
  - 详情页: `src/app/[locale]/(dashboard)/admin/agent-traces/[traceId]/page.tsx`
  - TraceSummaryCard + StepTimeline + StepDetailPanel
  - admin sidebar 导航 + i18n agentTrace namespace
  - 产出：页面 + 组件 + i18n

- [x] 78. Agent Summary View — 家长/学生简化视图
  - 共享组件 `src/components/agent-summary-card.tsx`
  - 集成到错题详情页 + 掌握地图详情
  - agent-trace router 新增 latestForQuestion / latestForKnowledgePoint
  - 前端 i18n 渲染本地化摘要
  - 产出：组件 + router 增强 + 页面集成 + i18n

- [x] 79. Sprint 8 验证 + Phase 2 全量自审
  - npm test + tsc --noEmit
  - Sprint 8 验证清单 + Phase 2 全部 9 个交付物验证
  - 产出：验证报告

- [x] 80. Phase 2 收尾文档
  - ROADMAP.md Sprint 8 → 已完成 + Phase 2 验收摘要
  - README.md 目录树同步
  - 产出：文档更新

## 验证清单

### Sprint 8 特有

- [x] report.weeklyReport 返回 7 天 mastery 聚合数据
- [x] report.monthlyReport 返回 30 天 mastery 聚合数据 + 趋势对比
- [x] report.knowledgeProgress 返回单个 KP 干预历史时间线
- [x] Report 权限: PARENT 验证 family 关系 + STUDENT 只能看自己
- [x] Report 空数据状态: 无 MasteryState 时显示"暂无学习数据"
- [x] Report 7d/30d 切换正常
- [x] agentTrace.list 返回分页 Trace 列表 + 筛选
- [x] agentTrace.detail 返回完整 steps + 用户信息
- [x] agentTrace.stats 返回近 7 天调用统计
- [x] Agent Trace 权限: ADMIN only
- [x] Agent Trace 详情页时序图正确展示步骤序列
- [x] 步骤 JSON 展开/折叠正常
- [x] AgentSummaryCard RUNNING 状态: spinner + "AI 正在分析..."
- [x] AgentSummaryCard COMPLETED: 本地化摘要 (非英文原文)
- [x] AgentSummaryCard 集成到错题详情页
- [x] AgentSummaryCard 集成到掌握地图详情
- [x] latestForQuestion / latestForKnowledgePoint 权限正确
- [x] admin sidebar 新增 Agent Traces 链接
- [x] parent sidebar 新增学习报告链接

### 通用（每 Sprint 必检）

- [x] 所有用户可见字符串使用 i18n key
- [x] npm test 通过 + tsc --noEmit 无错误
- [x] 无 any 类型泄露
- [x] Prisma 软删除全局过滤
- [x] 乐观锁（version 字段 where + increment）
- [x] 无密钥/Token 硬编码
- [x] RBAC 中间件覆盖所有新增 procedure

### Phase 2 全量验收

- [x] Skill 插件系统 (IPC 沙箱 + 管理页面)
- [x] Knowledge Graph schema + 知识点数据导入
- [x] Question Understanding Agent
- [x] Diagnosis Agent
- [x] Student Memory 层 (状态机 + 复习调度 + 干预历史)
- [x] Mastery Tracking (SM-2 间隔复习算法)
- [x] 4 个 Harness 组件 (CircuitBreaker, SemanticCache, CostTracker, AgentStepLimiter)
- [x] Agent Trace 可视化 (管理员完整 trace + 家长/学生简化版)
- [x] Parent Reports v1 (周报/月报，知识点维度)

## 关键设计决策

| # | 决策 | 方案 | 原因 |
|---|------|------|------|
| D1 | Report 单独 router | `report.ts` 独立于 `parent.ts` | parent router 已 332 行，报告聚合逻辑复杂，分离职责 |
| D2 | Agent Trace 单独 router | `agent-trace.ts` 独立于 `admin.ts` | 职责单一 + trace 查询复杂 |
| D3 | Report 不走 Harness | 纯 Prisma 聚合 | 无 AI 调用，确定性数据查询 |
| D4 | Agent Summary 渲染 | 前端 i18n key 渲染 | Worker 已写入英文 summary，前端解析 + 本地化 |
| D5 | 时序图实现 | CSS+Tailwind 自定义 | 步骤数少 (maxSteps≤10)，自定义 UI 更灵活 |
| D6 | Report 时间窗口 | 7d/30d 切换 | 与现有 parent/stats 一致的 UX |

## 完成定义

- 所有任务 checkbox 勾选
- 验证清单全部通过（含 Phase 2 全量验收）
- `npm test` 通过（含新增测试）
- `tsc --noEmit` 无错误
- i18n 中英双语覆盖
- ROADMAP.md Sprint 8 + Phase 2 状态更新
- README.md 目录树同步
