# Sprint 14: 掌握评估 Agent + 闭环完成 + 家长控制 (Week 19)

**Status**: COMPLETED

**目标**: Mastery Evaluation Agent + 闭环最后一环 + 家长学习控制面板。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 121 | ✅ Sprint 14 用户故事 + Sprint 文件 | US-053 (掌握评估 Agent)、US-054 (家长学习控制) |
| 122 | ✅ Mastery Evaluation Agent 定义 | `src/lib/domain/agent/definitions/mastery-evaluation.ts`：allowedSkills (evaluate_mastery, get_intervention_history, search_knowledge_points), maxSteps: 6, memoryWriteManifest: [] |
| 123 | ✅ evaluate-mastery Skill | `skills/evaluate-mastery/` + `skills/get-intervention-history/`：综合分析复习结果+练习表现+干预历史 -> 输出评估报告+建议 MasteryState 转换 |
| 124 | ✅ SM-2 增强：AI 混合调度 | 新增 `calculateHybridReview`：SM-2 基础值 + AI 调整因子（错误类型/历史掌握速度/工作量/考试临近度） |
| 125 | ✅ 学习闭环自动化 | PRACTICE 完成 + REVIEWING 态 -> mastery-evaluation BullMQ job -> Agent -> 输出建议 -> handler 验证后写 Memory -> 下次 Brain 纳入 |
| 126 | ✅ 家长学习控制 UI | `src/app/[locale]/(dashboard)/parent/settings/learning/page.tsx`：每日任务上限 slider、学习时段 time picker、操作日志；intervention-planning handler 校验学习时段 |
| 127 | ⚠️ Sprint 14 集成验证 | npm test + tsc --noEmit 全通过；闭环各环节由 handler 单元测试分别覆盖（见 end-to-end-loop.test.ts 头注），但真正的 end-to-end integration test 仍是 `test.todo()`（缺 mock AI provider + Job factory 基础设施），留作后续 Sprint 补齐 |

## 设计要点

- Mastery Evaluation Agent 不直接修改 MasteryState，输出建议（recommended transitions）。Handler 验证后调 Memory 层执行。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D17
- SM-2 增强参数：`{ errorType: 'calculation'|'concept'|'careless'|'method', masterySpeed: number, currentWorkload: number, examProximityDays?: number }`。设计决策见 §四 D18
- 闭环触发链：DailyTask.status=COMPLETED -> tRPC mutation -> enqueue `mastery-evaluation` -> Agent -> Memory update

## 验证清单

- [x] Mastery Evaluation Agent 定义完整
- [x] evaluate-mastery Skill 注册 ACTIVE（seed 自动发现 skills/）
- [x] SM-2 混合调度：AI 调整因子生效（`calculateHybridReview` + handler 调用）
- [ ] **完整闭环端到端** integration test — 仍是 `test.todo()`；闭环各环节由 handler 单测分别覆盖 + 手动验证 recipe（`src/tests/integration/end-to-end-loop.test.ts` 头注）。端到端 mock infra 留作后续 Sprint 补齐
- [x] 家长控制 UI：maxDailyTasks + learningTime 设置生效
- [x] Brain 遵守家长控制（maxDailyTasks 限制 + 新增 learningTime 区间检查）
- [x] npm test 全量通过（906 passed / 30 todo / 0 failed）
- [x] tsc --noEmit 无错误
- [x] i18n 新增 key 覆盖 zh + en
