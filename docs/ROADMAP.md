# 开发路线图

## Phase 1: 基础错题本 (MVP)

| Sprint | 周期 | 范围 | 状态 |
|--------|------|------|------|
| Sprint 1 | Week 1-2 | 基础架构 + 用户系统 + 家庭组 (US-001~007) | 已完成 |
| Sprint 2 | Week 3-4 | 作业录入 + AI Harness + AI 识别 + 多轮检查 (US-008~019) | 已完成 |
| Sprint 3 | Week 5-6 | 家长视图 + 错题管理 + PWA + 部署 (US-020~030) | 已完成 |

### Sprint 3 验收摘要 (2026-04-10)

- 测试: 23 文件, 350 passed, 0 failed
- 构建: `next build` 成功，28 路由
- AI 识别: 13.55s / 30s 限制 (PASS)
- 页面加载: 0.2s / 3s 限制 (PASS)
- 验收中发现并修复 4 个 Bug (middleware 冲突、recharts 类型、textarea 缺失、Azure API 参数)

### Phase 1 交付物

- 用户注册/登录/家庭组管理
- 拍照上传 → AI 识别 → 判分 → 多轮改正 → 渐进式求助
- 错题自动入本 + 去重 + 家长备注
- 家长概览/统计/策略设置
- 管理员用户管理/系统配置
- PWA + 中英双语 + Docker 部署

## Phase 2: AI 理解 + 知识图谱

| Sprint | 周期 | 范围 | 状态 |
|--------|------|------|------|
| Sprint 4a | Week 7 | Skill 插件基础设施（IPC 沙箱 + 打包 + 注册表）| 已完成 |
| Sprint 4b | Week 8 | Agent Runner + Memory + KG schema + Harness 新组件 | 已完成 |
| Sprint 5 | Week 9 | Knowledge Graph + Question Understanding Agent | 已完成 |
| Sprint 6 | Week 10 | Diagnosis Agent + Student Memory | 已完成 |
| Sprint 7 | Week 11 | Mastery Tracking + 间隔复习 | 已完成 |
| Sprint 8 | Week 12 | Parent Reports v1 + Agent Trace 可视化 + Phase 2 收尾 | 已完成 |

### Phase 2 验收摘要 (2026-04-11)

- 测试: 43 文件, 708 passed, 2 failed (pre-existing: skill-e2e flaky + perf timing)
- 构建: `tsc --noEmit` 0 错误
- 新增 router: report (3 procedures), agentTrace (6 procedures)
- 新增页面: parent/reports, admin/agent-traces (列表+详情)
- 新增组件: AgentSummaryCard (集成到错题详情+掌握地图)
- i18n: report + agentTrace namespace, 中英双语完整覆盖

### Phase 2 目标交付物

- Skill 插件系统（IPC 沙箱隔离，管理员可上传/启用/禁用 Skill）
- Knowledge Graph schema + 知识点数据导入
- Question Understanding Agent（题目 → 知识点映射）
- Diagnosis Agent（错题模式分析 + 薄弱环节诊断）
- Student Memory 层（掌握状态机 + 复习调度 + 干预历史）
- Mastery Tracking（SM-2 间隔复习算法）
- 4 个新 Harness 组件（CircuitBreaker, SemanticCache, CostTracker, AgentStepLimiter）
- Agent Trace 可视化（管理员完整 trace + 家长/学生简化版）
- Parent Reports v1（周报/月报，知识点维度）

### Phase 2 待完成事项

> 以下事项需在各 Sprint 开始时完成，此处记录以防遗漏：
> - [x] Sprint 5 开始时：写 US-031~034 完整用户故事
> - [x] Sprint 6 开始时：写 US-035~037 完整用户故事
> - [x] Sprint 7 开始时：写 US-038~040 完整用户故事
> - [x] Sprint 8 开始时：写 US-041~043 完整用户故事

### Phase 2 推迟到后续 Phase 的事项

> 以下事项在 REQUIREMENTS.md 或 PHASE2-LAUNCH-PLAN.md 中标注为 Phase 2+，
> 但经评估推迟到后续 Phase。Phase 3 启动时已逐项评估，仅 D3 继续推迟。

| # | 事项 | 来源 | 推迟原因 | 最终 Phase |
|---|------|------|---------|-----------|
| D1 | 三层薄弱分析（定期+全局） | REQUIREMENTS §9 | 实时层(30天)已实现，定期(学期)和全局(历史)需要 Learning Brain 编排定时任务 | **Phase 3 Sprint 11** ✅ 纳入 |
| D2 | 年级过渡策略 | REQUIREMENTS §9 | 需要学段归档逻辑 + 跨学段知识追溯，依赖 Learning Brain 全局视角 | **Phase 3 Sprint 11** ✅ 纳入 |
| D3 | 教材多版本管理 | REQUIREMENTS §8 | 当前单版本导入已满足 MVP，多版本对比需扩展 KG schema（版本字段+关系映射） | Phase 5（继续推迟） |
| D4 | SemanticCache 集成 | PHASE2-LAUNCH-PLAN D10 | pgvector Spike 已通过，但 Schema Adapter 优先级更高。需实现为 Harness 管道组件 | **Phase 3 Sprint 10a** ✅ 纳入 |
| D5 | ObservabilityTracer (OpenTelemetry) | REQUIREMENTS §2 | Phase 3 新增 Brain->Agent->Skill 多级调用链，需完整分布式 trace | **Phase 3 Sprint 10a** ✅ 纳入 |
| D6 | EvalFramework (AI 输出质量评估) | REQUIREMENTS §2 | Phase 3 新增 4 个 AI 操作，需标注数据集+评估管道保障质量 | **Phase 3 Sprint 16** ✅ 纳入 |
| D7 | KG 拖拽调整层级 | US-032 | 后端 update(parentId) 已支持，前端引入 dnd-kit | **Phase 3 Sprint 15** ✅ 纳入 |
| D8 | 低置信度映射管理员确认流程 | US-033 | confidence 字段已记录分级，需管理界面筛选+批量确认 | **Phase 3 Sprint 15** ✅ 纳入 |

## Phase 2 → Phase 3 过渡

| Sprint | 周期 | 范围 | 状态 |
|--------|------|------|------|
| Sprint 9 | Week 13 | Skill 系统设计缺口修补 | 已完成 |

> Sprint 9 修补 Phase 2 的 Skill 落地缺口：内置 Skill 注册、通用 IPC 路由、Phase 1 操作包装成 Skill。
> 详见 `docs/sprints/sprint-9-skill-gap.md`

## Phase 3: 学习闭环 + 干预（Learning Brain 全局编排）

> **重要**：Phase 3 在 Phase 2 基础设施上实现完整学习闭环。
> 核心新增：**Learning Brain**（事件驱动全局编排器），见 ADR-011。
> 推迟事项决策：D1/D2/D4/D5/D6/D7/D8 全部纳入，仅 D3（教材多版本）推迟到 Phase 5。
> 详见 `docs/PHASE3-LAUNCH-PLAN.md`

| Sprint | 周期 | 范围 | 状态 |
|--------|------|------|------|
| Sprint 10a | Week 14 | SemanticCache + ObservabilityTracer + Handler Registry | [x] |
| Sprint 10b | Week 15 | Learning Brain 编排器 + memoryWriteManifest | [x] |
| Sprint 11 | Week 16 | 薄弱分析增强（定期+全局）+ 年级过渡 | [x] |
| Sprint 12 | Week 17 | 干预规划 Agent + 今日任务包 | [x] |
| Sprint 13 | Week 18 | 类似题检索 + 讲解卡 | [x] |
| Sprint 14 | Week 19 | 掌握评估 Agent + 闭环完成 + 家长控制 | [ ] |
| Sprint 15 | Week 20 | 管理员 UI (D7 KG拖拽 + D8 映射确认) + Brain 监控 | [ ] |
| Sprint 16 | Week 21 | EvalFramework + 全量集成测试 + Phase 3 收尾 | [ ] |

## Phase 4: 家长仪表盘 + 体验优化

完整家长仪表盘、详细分析报告、AI 学习建议、干预追踪、儿童友好 UI 优化

## Phase 5: 持续优化

Learning Brain 全局编排、本地模型部署(Ollama/vLLM)、Android APK、多教材版本支持、安全增强
