# Phase 3 启动计划

> Learning Brain 闭环。Sprint 10a ~ 16，共 8 个 Sprint。
> 每个 Sprint 的任务明细在 `docs/sprints/sprint-{N}.md`，DB 模型设计在 `docs/phase3-db-schema.md`。

---

## 一、模块划分

Phase 3 围绕"学习闭环"实现 6 个模块：

| 模块 | 职责 | 核心新增 |
|------|------|---------|
| **A. 事件系统 + Learning Brain** | 事件驱动全局编排器 | BullMQ repeatable job + Brain orchestrator + Redis lock |
| **B. 薄弱分析增强** | 三层分析 + 年级过渡 | WeaknessProfile 模型 + 定期/全局 Skill + 学段归档 |
| **C. 干预规划** | AI 规划学习策略 | Intervention Planning Agent + DailyTask 模型 + 任务打包 |
| **D. 练习与讲解** | 类似题检索 + 讲解卡 | SemanticCache + find-similar-questions Skill + 讲解卡组件 |
| **E. 掌握评估** | 复习后重新评估 | Mastery Evaluation Agent + 评估闭环 + SM-2 增强 |
| **F. 管控与收尾** | 家长控制 + 管理验证 + 集成 | ParentStudentConfig 扩展 + D8 管理员 UI + 全量验收 |

模块依赖：A -> C -> D, A -> E, B -> A (数据源), F 在 Sprint 15, EvalFramework 在 Sprint 16。

---

## 二、Sprint 总览

| Sprint | 周期 | 范围 | Sprint 文件 | 状态 |
|--------|------|------|-------------|------|
| 10a | Week 14 | SemanticCache + ObservabilityTracer + Handler Registry | [sprint-10a.md](sprints/sprint-10a.md) | COMPLETED |
| 10b | Week 15 | Learning Brain 编排器 + memoryWriteManifest | [sprint-10b.md](sprints/sprint-10b.md) | COMPLETED |
| 11 | Week 16 | 薄弱分析增强（定期+全局）+ 年级过渡 | [sprint-11.md](sprints/sprint-11.md) | COMPLETED |
| 12 | Week 17 | 干预规划 Agent + 今日任务包 | [sprint-12.md](sprints/sprint-12.md) | DRAFT |
| 13 | Week 18 | 类似题检索 + 讲解卡 | [sprint-13.md](sprints/sprint-13.md) | COMPLETED |
| 14 | Week 19 | 掌握评估 Agent + 闭环完成 + 家长控制 | [sprint-14.md](sprints/sprint-14.md) | DRAFT |
| 15 | Week 20 | 管理员 UI (D7 KG拖拽 + D8 映射确认) + Brain 监控 | [sprint-15.md](sprints/sprint-15.md) | DRAFT |
| 16 | Week 21 | EvalFramework + 全量集成测试 + Phase 3 收尾 | [sprint-16.md](sprints/sprint-16.md) | DRAFT |

---

## 三、新增 Agent / Skill / BullMQ Job 总览

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

## 四、设计决策记录

| # | 决策 | 选择 | 选择原因 |
|---|------|------|---------|
| D11 | Learning Brain 实现 | BullMQ RepeatableJob + 确定性代码 | BullMQ 已有完整基础设施。Brain 是确定性逻辑不需 AI |
| D12 | Brain 触发频率 | 每日 1 次 cron `0 6 * * *` | Solo dev 优先简单可靠 |
| D13 | Brain 并发控制 | Redis SETNX per-student, TTL 5min | Redis 已在栈中，SETNX 最简 |
| D14 | DailyTaskPack 模型 | 独立模型 | 任务包有独立生命周期，需独立状态管理 |
| D15 | 类似题检索 | 双路：KP 维度 + pgvector embedding | KP 保证知识相关，embedding 补内容相似 |
| D16 | 讲解卡格式选择 | AI 自动选（基于年级+难度） | K-12 跨度大，AI 判断更灵活 |
| D17 | Mastery Eval 写入权限 | Agent 输出建议，handler 验证后写 Memory | 保持 Memory 层唯一写入点（ADR-010） |
| D18 | SM-2 增强 | 保留 SM-2 + AI 调整因子 | SM-2 作为稳定基线，AI 根据额外因素调整 interval |
| D19 | SemanticCache | Harness 管道组件，pgvector brute-force | Spike 确认 < 50ms @ 5000 条 |
| D20 | 年级过渡 | MasteryState archived 标记 | 不丢数据，旧数据可追溯 |
| D21 | ObservabilityTracer | OpenTelemetry SDK + Jaeger | Jaeger 免费开源，OTel 行业标准 |
| D22 | EvalFramework | 标注数据集 + AI 评判 | 结构化字段规则匹配，自由文本 AI 评判 |
| D23 | KG 拖拽库 | @dnd-kit/core + sortable | 体积小、API 现代、支持树形结构 |

---

## 五、工程机制调整

### memoryWriteManifest（Sprint 10b 实现）

AgentDefinition 新增 `memoryWriteManifest: string[]`，声明该 Agent 允许写入的 Memory 方法。MemoryWriteInterceptor 在 IPC handler 层拦截，不在白名单的写入直接拒绝。与 allowedSkills 模式一致。

### 用户故事格式扩展

Phase 3 Agent 的用户故事在 Phase 2 模板基础上新增：

```markdown
**Memory 写入清单**:
- 方法名: 写入内容说明

**Brain 触发条件**（仅 Brain 相关 US）:
- 触发事件: 执行动作
```

---

## 六、前置工作清单（已完成）

- [x] ADR-011 + ARCHITECTURE.md S6.5 方向一致
- [x] docker-compose pgvector/pgvector:pg16
- [x] CREATE EXTENSION vector 验证通过
- [x] Prisma schema 增量确认（见 `docs/phase3-db-schema.md`）
- [x] BullMQ upsertJobScheduler API 可用（v5.73.3）
- [x] CLAUDE.md Rule 8/9 更新
- [x] 现有 10 个 Skill 全部 ACTIVE（8 业务 + 2 测试工具）
- [x] Brain 日志格式：AdminLog action=`brain-run`
- [x] Jaeger all-in-one 镜像可拉取
- [x] @dnd-kit/core ~10-12kB gzip, React 18 兼容

---

## 七、Phase 3 验收标准

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
10. **AI 质量评估**：EvalRunner 全部操作类型通过率 ≥ 80%
11. **测试覆盖**：新增测试覆盖所有 Agent / Skill / Brain / Eval，npm test 全量通过
