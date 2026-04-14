# Sprint 14: 掌握评估 Agent + 闭环完成 + 家长控制 (Week 19)

**Status**: DRAFT

**目标**: Mastery Evaluation Agent + 闭环最后一环 + 家长学习控制面板。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 121 | Sprint 14 用户故事 + Sprint 文件 | US-053 (掌握评估 Agent)、US-054 (家长学习控制) |
| 122 | Mastery Evaluation Agent 定义 | `src/lib/domain/agent/definitions/mastery-evaluation.ts`：allowedSkills (evaluate_mastery, get_intervention_history, search_knowledge_points), maxSteps: 6, memoryWriteManifest: [] |
| 123 | evaluate-mastery Skill | `skills/evaluate-mastery/`：综合分析复习结果+练习表现+干预历史 -> 输出评估报告+建议 MasteryState 转换 |
| 124 | SM-2 增强：AI 混合调度 | 新增 `calculateHybridReview`：SM-2 基础值 + AI 调整因子（错误类型/历史掌握速度/工作量/考试临近度） |
| 125 | 学习闭环自动化 | DailyTask 完成 -> mastery-evaluation BullMQ job -> Agent -> 输出建议 -> handler 验证后写 Memory -> 下次 Brain 纳入 |
| 126 | 家长学习控制 UI | `src/app/[locale]/(dashboard)/parent/settings/learning/page.tsx`：每日任务上限 slider、学习时段 time picker、操作日志 |
| 127 | Sprint 14 集成验证 | **完整闭环端到端**：新错题 -> Brain -> 诊断 -> 干预 -> 任务生成 -> 完成 -> 评估 -> 状态更新 -> Brain 下一轮。npm test + tsc --noEmit |

## 设计要点

- Mastery Evaluation Agent 不直接修改 MasteryState，输出建议（recommended transitions）。Handler 验证后调 Memory 层执行。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D17
- SM-2 增强参数：`{ errorType: 'calculation'|'concept'|'careless'|'method', masterySpeed: number, currentWorkload: number, examProximityDays?: number }`。设计决策见 §四 D18
- 闭环触发链：DailyTask.status=COMPLETED -> tRPC mutation -> enqueue `mastery-evaluation` -> Agent -> Memory update

## 验证清单

- [ ] Mastery Evaluation Agent 定义完整
- [ ] evaluate-mastery Skill 注册 ACTIVE
- [ ] SM-2 混合调度：AI 调整因子生效
- [ ] **完整闭环端到端**测试通过
- [ ] 家长控制 UI：maxDailyTasks + learningTime 设置生效
- [ ] Brain 遵守家长控制（maxDailyTasks 限制）
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
- [ ] i18n 新增 key 覆盖 zh + en
