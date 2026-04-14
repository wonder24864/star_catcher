# Sprint 11: 薄弱分析增强 + 年级过渡 (Week 16)

**Status**: DRAFT

**目标**: 三层薄弱分析（定期+全局）+ 年级过渡策略，为 Intervention Planning 提供数据基础。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 100 | Sprint 11 用户故事 + Sprint 文件 | US-047 (三层薄弱分析)、US-048 (年级过渡策略) |
| 101 | weakness-profile Skill | `skills/weakness-profile/`：定期分析（学期内 MasteryState 聚合）+ 全局分析（全历史跨学期），输出 WeaknessProfile JSON |
| 102 | 定期/全局分析 BullMQ 任务 | 定期分析：Schedule Registry 注册每周一次。全局分析：学期末手动触发。结果写入 WeaknessProfile |
| 103 | 年级过渡逻辑 | MasteryState `archived` 字段。学段跨越时批量归档。新错题回溯旧学段 KP 时 InterventionHistory 标记 `foundationalWeakness` |
| 104 | Memory 层扩展 | StudentMemoryImpl 新增：`getWeaknessProfile()`, `archiveMasteryBySchoolLevel()`, `checkFoundationalWeakness()` |
| 105 | Brain 集成薄弱数据 | Brain 编排逻辑中新增：读取 WeaknessProfile -> 趋势恶化时触发 Intervention Agent |
| 106 | Sprint 11 集成验证 | 三层分析端到端，年级过渡场景测试，npm test + tsc --noEmit |

## 设计要点

- WeaknessProfile 模型：`{ studentId, tier: REALTIME|PERIODIC|GLOBAL, data: JSONB, generatedAt, validUntil }`。DB schema 见 `docs/phase3-db-schema.md`
- 定期分析只看当前学期（按 createdAt 时间窗口），全局分析看全历史
- 年级过渡不删数据，只设 archived。已归档 MasteryState 不参与实时分析和 SM-2 调度。设计决策见 PHASE3-LAUNCH-PLAN.md §六 D20

## 验证清单

- [ ] weakness-profile Skill 注册 ACTIVE + schema/manifest 完整
- [ ] 定期分析 BullMQ cron 注册 + 手动触发端到端
- [ ] WeaknessProfile 三层数据写入 + 查询
- [ ] 年级过渡：archived MasteryState 不参与活跃调度
- [ ] Brain 读取 WeaknessProfile 并决策
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
