# Sprint 16: EvalFramework + 全量集成测试 + Phase 3 收尾 (Week 21)

**Status**: DRAFT

**目标**: D6 AI 输出质量评估框架 + 全量集成测试 + Phase 3 验收。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 134 | Sprint 16 用户故事 + Sprint 文件 | US-057 (EvalFramework) |
| 135 | 标注数据集创建 | 为每个 AIOperationType（共 13 个）创建 golden test cases（每个 3-5 条）：输入数据 + 期望输出 + 评估维度（correctness/completeness/safety）。存放在 `tests/eval/datasets/` |
| 136 | EvalRunner 评估管道 | `src/lib/domain/ai/eval/eval-runner.ts`：加载标注数据集 -> 对每条数据调用 AI 操作 -> 与期望输出对比（结构化字段精确匹配 + 自由文本 AI 评判）-> 输出评分报告 JSON |
| 137 | AI 评判 Skill：eval-judge | `skills/eval-judge/`：使用 AI 对比 actual vs expected 自由文本输出，打分 1-5 + 给出评估理由。AIOperationType 新增 `EVAL_JUDGE`。设计决策见 PHASE3-LAUNCH-PLAN.md §六 D22 |
| 138 | 质量报告页面 | `src/app/[locale]/(dashboard)/admin/eval/page.tsx`：评估运行列表 + 每次运行的详细报告（按操作类型分组、通过率、失败案例详情）|
| 139 | 全量集成测试 + 闭环场景 | 完整闭环自动化测试 + 边界（Brain 并发锁、Agent 超步数、空数据、EvalRunner 回归） |
| 140 | Phase 3 验收 + 文档同步 | ROADMAP Sprint 10a-16 状态、README 目录树、CLAUDE.md 规则更新、Phase 3 验收摘要 |

## 验证清单（Phase 3 验收标准）

- [ ] **闭环完整性**：新错题 -> 诊断 -> 薄弱分析 -> 干预规划 -> 任务生成 -> 学生完成 -> 掌握评估 -> 状态更新，全链路自动化
- [ ] **Learning Brain 运行**：BullMQ cron 每日执行，扫描所有活跃学生
- [ ] **今日任务包**：学生看到个性化任务列表，完成后状态自动更新
- [ ] **类似题检索**：pgvector 查询 < 100ms
- [ ] **讲解卡**：static / interactive / conversational 三格式正确渲染
- [ ] **家长控制**：maxDailyTasks + learningTime 设置生效，Brain 遵守
- [ ] **管理员验证**：低置信度 mapping 筛选 + 批量确认正常
- [ ] **KG 拖拽**：知识图谱层级可通过拖拽调整
- [ ] **可观测性**：Brain->Agent->Skill->AI 完整 trace 在 Jaeger 可查看
- [ ] **AI 质量评估**：EvalRunner 全部操作类型通过率 ≥ 80%
- [ ] **测试覆盖**：npm test 全量通过
- [ ] ROADMAP + README 目录树 + CLAUDE.md 同步
