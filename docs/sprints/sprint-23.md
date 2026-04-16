# Sprint 23: MasteryStateHistory + Brain 优化 (Week 28)

**Status**: COMPLETED

**目标**: Learning Brain 优化 — 掌握状态历史追踪、CORRECTED 事件激活、渐进式冷却、管理员手动触发。

## 设计决策

Phase 4 D47-D52 继续生效。Sprint 23 新增：

1. D53: 独立 MasteryStateHistory 表（不复用 InterventionHistory）— 语义不同（状态审计 vs 干预记录），查询效率更高
2. D54: CORRECTED 是瞬态（auto→REVIEWING），profile router 只查 toStatus=CORRECTED 避免噪音
3. D55: Redis JSON `{tier,setAt}` 存渐进冷却（tier 1=6h, 2=12h, 3=24h）
4. D56: 管理员手动触发 Brain + 冷却覆盖 — AdminLog 审计
5. D57: Brain 批次缓存经分析不需要 — fan-out 模式每个学生是独立 BullMQ job，单学生 run 内无重复查询

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 205 | [x] Sprint 23 文件 | `docs/sprints/sprint-23.md` |
| 206 | [x] MasteryStateHistory Prisma 模型 + migrate | `prisma/schema.prisma` + migration |
| 207 | [x] 状态转换记录钩子 | `src/lib/domain/memory/student-memory.ts` |
| 208 | [x] Profile router CORRECTED 事件源 | `src/server/routers/profile.ts` |
| 209 | [x] i18n 验证 + 补全 | `src/i18n/messages/*.json`（wonder/cosmic tier 补 CORRECTED） |
| 210 | [x] Brain 渐进式冷却 | `src/lib/domain/brain/learning-brain.ts` + `index.ts` |
| 211 | [x] 管理员手动触发 Brain + 冷却覆盖 | `src/server/routers/brain.ts` |
| 212 | [x] Brain 批次内存缓存 — SKIPPED | 分析后确认无冗余，无需缓存（D57） |
| 213 | [x] 单元测试 | learning-brain / brain-router / student-memory / profile-router / e2e-loop 全部更新 |
| 214 | [x] 自审 + 文档同步 | Sprint 文件勾选 + commit |

## 验证清单

- [x] `npx tsc --noEmit` 0 错误
- [x] `npm test` 全量通过（78 files, 1091 passed, 30 todo, 0 failed）
- [x] `npm run build` 成功
- [x] MasteryStateHistory 记录状态转换（updateMasteryState D53 + recordPracticeAttempt CORRECTED 路径）
- [x] CORRECTED 事件在学生画像时间线显示（profile router Source 5, EVENT_EMOJI ✅ + orange dot 已就位）
- [x] 渐进冷却 tier 1→2→3 正确递增（parseCooldownValue + getCooldownTTL 测试覆盖）
- [x] Redis cooldown key 包含 JSON `{tier, setAt}`（handler 更新 + 测试验证）
- [x] 管理员 triggerBrain mutation 入队 + AdminLog 记录（brain-router 测试覆盖）
- [x] 管理员 overrideCooldown mutation 清除 Redis key + AdminLog 记录（brain-router 测试覆盖）
- [x] 无 `any` / `ts-ignore`
- [x] 未使用声明溯源 (Rule 8) — 无新增未使用声明
- [x] i18n: zh + en 完整覆盖（wonder tier 补 "改对啦！"，cosmic tier 补 "纠正成功！"）
