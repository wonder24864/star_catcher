# Sprint 18: AI 学习建议 + 干预追踪 (Week 23)

**Status**: COMPLETED

**目标**: 模块 B — AI 驱动个性化学习建议 + 干预效果追踪面板。

## 用户故事

- US-061: AI 学习建议 — 见 [parent-analytics-phase4.md](../user-stories/parent-analytics-phase4.md)
- US-062: 干预效果追踪 — 见 [parent-analytics-phase4.md](../user-stories/parent-analytics-phase4.md)

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 150 | [x] Sprint 18 文件 + 用户故事确认 | `docs/sprints/sprint-18.md`；US-061/062 验收标准确认 |
| 151 | [x] Prisma schema 变更 | `LearningSuggestion` 模型 + `SuggestionType` 枚举 + `LEARNING_SUGGESTION` AIOperationType + `InterventionHistory.preMasteryStatus` 字段 |
| 152 | [x] Harness 三件套: LEARNING_SUGGESTION | `schemas/learning-suggestion.ts` + `prompts/learning-suggestion.ts` + `operations/learning-suggestion.ts` + registry 注册 |
| 153 | [x] Skill: generate-learning-suggestions | `skills/generate-learning-suggestions/schema.json` + `execute.ts` + `manifest.json` |
| 154 | [x] Eval 数据集 | `tests/eval/datasets/learning-suggestion.json` (4 cases) + `DATASET_FILE_MAP` 更新 |
| 155 | [x] BullMQ: learning-suggestion job | `LearningSuggestionJobData` 类型 + handler + handler-registry + schedule-registry (周日 cron) + enqueue 函数 |
| 156 | [x] preMasteryStatus 回填 + getActiveStudentIds 提取 | `logIntervention()` 自动快照 + `shared-active-students.ts` 共享模块；weakness-profile execute.ts createdAt 类型修复 |
| 157 | [x] tRPC: 学习建议 (4 procedures) | `parent.getLearningSuggestions` + `parent.requestLearningSuggestions`(含 cooldown) + `parent.interventionEffect` + `parent.interventionTimeline` |
| 158 | [x] 前端: parent/suggestions 页面 | 学习建议卡片(三区) + 按需刷新(含 cooldown) + 干预效果对比 + 干预时间线 + 空状态引导 |
| 159 | [x] 导航 + i18n | 侧栏/底部导航新增"学习建议"入口；`parent.suggestions.*` + `parent.intervention.*` i18n keys |
| 160 | [x] 测试 | tRPC procedures 单测 + Harness schema 单测 + handler-registry 更新 (1021 passed, 0 failures) |

## 验证清单

- [x] `npx prisma generate` 成功（migrate 需线上 DB）
- [x] `npx tsc --noEmit` 0 错误
- [x] `npm run build` 成功
- [x] `npm test` 全量通过 (1021 passed, 0 failures)
- [x] `DATASET_FILE_MAP` 穷举 — 编译期保险通过
- [x] `getActiveStudentIds` 去重：learning-brain + weakness-profile + learning-suggestion 共用 `shared-active-students.ts`
- [x] `logIntervention()` 自动快照 preMasteryStatus
- [x] `requestLearningSuggestions` 冷却期 1h
- [ ] parent/suggestions 页面渲染学习建议三区 ← 待你手动验证
- [ ] 按需刷新触发 BullMQ job ← 待你手动验证
- [ ] 干预效果对比卡片显示 preMastery→currentMastery delta ← 待你手动验证
- [ ] 干预时间线按时间倒序 ← 待你手动验证
- [ ] 7d/30d 切换生效 ← 待你手动验证
- [ ] 导航入口可见 ← 待你手动验证
- [x] i18n 完整覆盖 zh + en
