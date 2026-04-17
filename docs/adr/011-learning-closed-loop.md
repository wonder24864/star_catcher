# ADR-011: 学习闭环架构（跨 Phase 2-3-5）

## Status
Accepted (Phase 2-3-5) — Phase 3 设计决策 D11-D23 已确认；Phase 5 新增 D53-D57（2026-04-16）

## Context

Star Catcher 的核心产品价值是帮助学生从"错题出现"到"稳定掌握"的完整学习闭环。这个闭环需要跨 Phase 2 和 Phase 3 分步实现。本 ADR 记录整体设计和分阶段路径。

两个维度的闭环嵌套：
- **学习闭环**（业务目标）：错题 → 诊断 → 薄弱分析 → 复习 → 掌握评估 → 掌握/回退
- **Agent 操作闭环**（实现手段）：Agent 观察 → 选 Skill → 执行 → 评估 → 更新状态 → 继续/停止

## Decision

### 学习闭环总览

```
错题出现 → AI 诊断（知识点定位）→ 薄弱分析 → 复习推荐 → 学生练习 → 掌握评估
    ↑                                                                |
    └──────── 未掌握(REGRESSED)：重新进入循环 ←──────────────────────┘
    （掌握(MASTERED)：退出循环，进入长期监测）
```

### Phase 2 实现范围（用户触发 + Agent 内部自主）

Phase 2 实现闭环的前半段 + 状态追踪：

| 闭环步骤 | Phase 2 实现 | 实现方式 |
|----------|-------------|---------|
| 错题出现 | Phase 1 已有 | ErrorQuestion 入本 |
| AI 诊断 | Question Understanding Agent | 自动映射题目→知识点 |
| 薄弱分析 | Diagnosis Agent | 错题模式分析→薄弱定位 |
| 掌握追踪 | Student Memory 状态机 | 自动状态流转 |
| 复习调度 | SM-2 算法 | 计算间隔 |
| 家长可见 | Parent Reports v1 | 周报/月报 |

**Phase 2 的 Agent 由用户操作触发**（完成检查 → 触发诊断），Agent 内部自主选择 Skill。

### Phase 3 实现范围（Learning Brain 全局编排）

> **重要**：Phase 3 的以下内容已设计但在 Phase 2 不实现。
> Phase 2 完成后开始 Phase 3 时，首先阅读此 ADR。

| 闭环步骤 | Phase 3 新增 | 组件 |
|----------|-------------|------|
| 全局编排 | Learning Brain | 事件驱动全局编排器 |
| 事件系统 | Event Trigger | 新错题/复习到期/掌握下降 → 自动触发 Agent |
| 干预规划 | Intervention Planning Agent | 长期学习规划 + 干预策略选择 |
| 今日任务包 | Daily Task Packager | 类似题推荐 + 练习卡 + 讲解卡 |
| 掌握评估 | Mastery Evaluation Agent | 复习后重新评估 |
| 完整闭环 | 全自主循环 | 观察→决策→执行→更新 |

**Phase 3 的 Learning Brain 是事件驱动的**：
- 新错题事件 → 启动 Diagnosis Agent
- 复习到期事件 → 启动 Review Agent
- 掌握度下降事件 → 启动 Intervention Agent
- Learning Brain 自主决定启动哪个 Agent、以什么策略执行

### 可控性设计

闭环的"可控"体现在五个层面：

1. **家长控制点**: 最大帮助等级（Phase 1 已有）、每日任务量（Phase 3）、学习时段（Phase 3）
2. **Agent 终止保障**: AgentStepLimiter + CostTracker + 显式终止条件
3. **Skill 管理权**: 管理员可启用/禁用 Skill，控制 Agent 能力边界
4. **执行透明**: Agent Trace 可视化（管理员完整 trace + 家长/学生简化版）
5. **状态可审计**: Student Memory 所有变更记录在 InterventionHistory

## Consequences

**Positive:**
- 完整的产品闭环设计，不是松散的功能堆叠
- Phase 2/3 分步实现，每步都有独立交付价值
- 多层可控性保障（家长、管理员、系统级别）

**Negative:**
- Phase 3 依赖 Phase 2 的所有基础设施
- 闭环完整性要到 Phase 3 才能真正验证
- Learning Brain 的事件系统是 Phase 3 的重大工程

## Phase 3 设计决策确认（2026-04-13）

Phase 3 启动计划已确认，关键设计决策：

- **D11**: Learning Brain = BullMQ RepeatableJob + 确定性代码（不调 AI）
- **D12**: Brain 每日 1 次 cron `0 22 * * *` UTC (= 北京 06:00)。周期**可在 `/admin/settings` 运行时调整**，无需重启 Worker：解析优先级 `SystemConfig(schedule.brain.cron)` → `BRAIN_CRON_PATTERN` env → 代码默认。同样机制覆盖 `weakness-profile-weekly` 与 `learning-suggestion-weekly`。见 `src/lib/infra/schedule/schedule-manager.ts`（运行时门面，调用 BullMQ/Redis，属 infra 层）+ `src/lib/domain/config/schedule-config.ts`（纯常量 + `cron-parser` 校验函数，属 domain 层）。
  > **路径迁移（2026-04-17）**：早期 `schedule-manager.ts` 放在 `src/lib/domain/config/`，但它依赖 BullMQ Queue / Redis 属基础设施能力，已搬到 `src/lib/infra/schedule/` 以符合分层原则。`schedule-config.ts` 保持在 domain（只导出常量和纯函数）。
- **D13**: 并发控制 = Redis SETNX per-student, TTL 5min
- **D17**: Mastery Eval Agent 输出建议，handler 验证后写 Memory（保持 Memory 层唯一写入点）
- **D18**: SM-2 保留 + AI 调整因子增强

新增工程机制：
- **Handler Registry**: Worker job 路由从 switch 重构为注册表
- **Schedule Registry**: 定时任务声明式注册
- **memoryWriteManifest**: AgentDefinition 新增 Memory 写入方法白名单 + MemoryWriteInterceptor 拦截器

完整决策列表（D11-D23）见 `docs/PHASE3-LAUNCH-PLAN.md` §六。

## Phase 5 设计决策（2026-04-16）

Phase 5 对 Learning Brain 的优化和补全：

- **D53**: 独立 `MasteryStateHistory` 审计表 — 语义不同于 InterventionHistory（状态转换 vs 干预记录），best-effort 写入（失败不阻断主转换）
- **D54**: CORRECTED 是瞬态（auto→REVIEWING），profile router 只查 `toStatus=CORRECTED` 避免时间线噪音
- **D55**: 渐进冷却替代固定 24h — tier 1=6h / 2=12h / 3=24h（cap），Redis value 从 `"1"` 改为 JSON `{tier, setAt}`
- **D56**: 管理员手动触发 `triggerBrain` + 冷却覆盖 `overrideCooldown` — AdminLog 审计，运维必要能力
- **D57**: Brain 批次缓存分析后不需要 — fan-out 模式每个学生是独立 BullMQ job，单学生 run 内无重复查询

完整决策列表（D53-D57 + D35-D39）见 `docs/PHASE5-LAUNCH-PLAN.md` §四。
