# Sprint 11: 薄弱分析增强 + 年级过渡 (Week 16)

**Status**: COMPLETED

**目标**: 三层薄弱分析（定期+全局）+ 年级过渡策略，为 Intervention Planning 提供数据基础。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 100 | ~~Sprint 11 用户故事 + Sprint 文件~~ ✅ | US-047 (三层薄弱分析)、US-048 (年级过渡策略) |
| 101 | ~~weakness-profile Skill~~ ✅ | `skills/weakness-profile/`：纯数据聚合 Skill（不调 AI），severity/trend 分类 + 共享计算逻辑 `compute-profile.ts` |
| 102 | ~~定期/全局分析 BullMQ 任务~~ ✅ | handler fan-out 模式 + `enqueueWeaknessProfile` + Admin tRPC `triggerWeaknessProfile` 端点 |
| 103 | ~~年级过渡逻辑~~ ✅ | InterventionHistory +`foundationalWeakness` 字段 + 共享 `gradeToSchoolLevel` / `isLowerSchoolLevel` 工具 |
| 104 | ~~Memory 层扩展~~ ✅ | archived 过滤 bug fix + `getWeaknessProfile/saveWeaknessProfile/archiveMasteryBySchoolLevel/checkFoundationalWeakness` |
| 105 | ~~Brain 集成薄弱数据~~ ✅ | Brain 读取 PERIODIC WeaknessProfile → 合并 weakPoints + worseningKPIds → intervention-planning |
| 106 | ~~Sprint 11 集成验证~~ ✅ | 52 test files, 810 tests passed, tsc --noEmit clean |

## 设计要点

- WeaknessProfile 模型：`{ studentId, tier: REALTIME|PERIODIC|GLOBAL, data: JSONB, generatedAt, validUntil }`。DB schema 见 `docs/phase3-db-schema.md`
- 定期分析只看当前学期（按 createdAt 时间窗口），全局分析看全历史
- 年级过渡不删数据，只设 archived。已归档 MasteryState 不参与实时分析和 SM-2 调度。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D20

## 验证清单

- [x] weakness-profile Skill 注册 ACTIVE + schema/manifest 完整（seed 自动发现 `skills/weakness-profile/`）
- [x] 定期分析 BullMQ cron 注册（Schedule Registry 已有 `weakness-profile-weekly`）+ Admin 手动触发（`triggerWeaknessProfile` mutation）
- [x] WeaknessProfile 写入（`saveWeaknessProfile`）+ 查询（`getWeaknessProfile` 含 validUntil 过滤）
- [x] 年级过渡：`getWeakPoints` + `getOverdueReviews` + `getActiveStudentIds` 均加 `archived: false` 过滤
- [x] Brain 读取 PERIODIC WeaknessProfile → WORSENING KPs 合并到 intervention-planning 决策
- [x] npm test 全量通过（52 files, 810 tests passed, 不含 DB-dependent perf tests）
- [x] tsc --noEmit 无错误
