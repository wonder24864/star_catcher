# ADR-011: 学习闭环架构（跨 Phase 2-3）

## Status
Accepted (Phase 2-3)

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
