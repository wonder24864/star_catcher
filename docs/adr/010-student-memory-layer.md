# ADR-010: Student Memory 层状态隔离

## Status
Accepted (Sprint 4b)

## Context

Phase 2 的 Agent 和 Skill 需要频繁读写学生学习状态（掌握度、复习计划、干预历史）。如果允许 Agent/Skill 直接 Prisma 写入：
- 状态散落在不同 Skill 实现中，无法统一管理
- 掌握度状态机转换无法集中验证（可能跳过中间状态）
- 缓存失效困难（不知道谁改了什么）
- 难以审计（状态变更没有统一日志）

需要一个 Memory 层作为 Agent/Skill 访问学生状态的唯一网关。Skill 通过 IPC 协议（见 ADR-008）访问 Memory 层。

## Decision

### 掌握度状态机

```
NEW_ERROR → CORRECTED → REVIEWING → MASTERED
                ↑            |
                └─ REGRESSED ←┘
```

- `NEW_ERROR`: 首次出错，错题入本
- `CORRECTED`: 在检查流程中已改正，尚未进入复习
- `REVIEWING`: 进入间隔复习阶段
- `MASTERED`: 连续通过 N 次复习检验
- `REGRESSED`: 已掌握的知识点再次出错，回到复习

Memory 层验证每次转换的合法性，拒绝非法跳转（如 NEW_ERROR → MASTERED）。

### 转换规则

| 当前状态 | 允许的下一状态 | 触发条件 |
|---------|-------------|---------|
| NEW_ERROR | CORRECTED | 学生在改正流程中答对 |
| CORRECTED | REVIEWING | 改正后首次进入复习队列（系统自动） |
| REVIEWING | MASTERED | consecutiveCorrect ≥ 3（SM-2 算法判定） |
| REVIEWING | REGRESSED | 复习时答错 |
| MASTERED | REGRESSED | 新错题匹配到已掌握的知识点 |
| REGRESSED | REVIEWING | 重新进入复习队列（系统自动） |

**禁止的转换**（Memory 层拒绝）：
- NEW_ERROR → REVIEWING / MASTERED（必须先改正）
- CORRECTED → MASTERED（必须经过复习验证）
- 任何状态 → NEW_ERROR（NEW_ERROR 只在错题首次入库时创建）

### 类型定义

```typescript
// 掌握度合法转换（discriminated union，Memory 层据此验证）
type MasteryTransition =
  | { from: 'NEW_ERROR';  to: 'CORRECTED'; reason: string }
  | { from: 'CORRECTED';  to: 'REVIEWING';  reason: string }
  | { from: 'REVIEWING';  to: 'MASTERED';   reason: string }
  | { from: 'REVIEWING';  to: 'REGRESSED';  reason: string }
  | { from: 'MASTERED';   to: 'REGRESSED';  reason: string }
  | { from: 'REGRESSED';  to: 'REVIEWING';  reason: string };

// 干预类型（与 InterventionHistory.type 枚举对应）
type InterventionType = 'DIAGNOSIS' | 'HINT' | 'REVIEW' | 'EXPLANATION';

// 干预历史记录（InterventionHistory 表的读取视图）
interface InterventionRecord {
  id: string;
  type: InterventionType;
  content: unknown;
  agentId: string | null;
  skillId: string | null;
  createdAt: Date;
}
```

### Memory 层接口（通过 IPC 暴露给 Skill）

```typescript
// Skill 通过 ctx.readMemory / ctx.writeMemory 调用以下方法
interface StudentMemory {
  // 掌握度
  getMasteryState(studentId: string, knowledgePointId: string): MasteryState | null;
  updateMasteryState(studentId: string, knowledgePointId: string, transition: MasteryTransition): MasteryState;
  getWeakPoints(studentId: string, options?: { subject?: string; limit?: number }): MasteryState[];

  // 复习调度
  getNextReviewDate(studentId: string, knowledgePointId: string): Date | null;
  scheduleReview(studentId: string, knowledgePointId: string, interval: number): void;
  getOverdueReviews(studentId: string): ReviewSchedule[];

  // 干预历史（append-only）
  logIntervention(studentId: string, knowledgePointId: string, type: InterventionType, content: unknown): void;
  getInterventionHistory(studentId: string, knowledgePointId: string): InterventionRecord[];
}
```

### IPC 协议映射

Skill 通过 `ctx.readMemory(method, params)` / `ctx.writeMemory(method, params)` 调用 Memory 层。`method` 参数对应 StudentMemory 接口方法名：

| ctx 调用 | method 值 | 路由到 |
|---------|----------|-------|
| `ctx.readMemory('getMasteryState', { studentId, knowledgePointId })` | getMasteryState | StudentMemory.getMasteryState() |
| `ctx.readMemory('getWeakPoints', { studentId, options })` | getWeakPoints | StudentMemory.getWeakPoints() |
| `ctx.readMemory('getNextReviewDate', { studentId, knowledgePointId })` | getNextReviewDate | StudentMemory.getNextReviewDate() |
| `ctx.readMemory('getOverdueReviews', { studentId })` | getOverdueReviews | StudentMemory.getOverdueReviews() |
| `ctx.readMemory('getInterventionHistory', { studentId, knowledgePointId })` | getInterventionHistory | StudentMemory.getInterventionHistory() |
| `ctx.writeMemory('updateMasteryState', { studentId, knowledgePointId, transition })` | updateMasteryState | StudentMemory.updateMasteryState() |
| `ctx.writeMemory('scheduleReview', { studentId, knowledgePointId, interval })` | scheduleReview | StudentMemory.scheduleReview() |
| `ctx.writeMemory('logIntervention', { studentId, knowledgePointId, type, content })` | logIntervention | StudentMemory.logIntervention() |

宿主进程接收 IPC 消息后，根据 `type`（`memory.read` / `memory.write`）和 `method` 路由到对应的 StudentMemory 实现方法。

### Prisma Schema 方向

```
MasteryState:
  - id, studentId, knowledgePointId (unique compound)
  - status: NEW_ERROR | CORRECTED | REVIEWING | MASTERED | REGRESSED
  - totalAttempts, correctAttempts
  - lastAttemptAt, masteredAt
  - version（乐观锁）
  - createdAt, updatedAt

ReviewSchedule:
  - id, studentId, knowledgePointId (unique compound)
  - nextReviewAt, interval（天数）
  - easeFactor（SM-2 算法参数，默认 2.5）
  - consecutiveCorrect
  - createdAt, updatedAt

InterventionHistory:
  - id, studentId, knowledgePointId
  - type: DIAGNOSIS | HINT | REVIEW | EXPLANATION
  - content (JSONB)
  - agentId, skillId（来源追踪）
  - createdAt
```

### 关键约束

- **只能通过 Memory 层写入** — Agent/Skill 不能直接 Prisma 写入学生表
- **架构测试强制执行** — 扫描 Skill bundle，禁止包含 Prisma 相关 import
- **读取标注缓存策略** — 每个读取方法标注推荐 TTL（供未来 SemanticCache 使用）
- **变更日志** — 每次状态转换自动写入 InterventionHistory

## Consequences

**Positive:**
- 状态机转换一致性有保障
- 单一写入点，方便缓存管理和审计
- Skill 代码更简洁（调 Memory API，不写 Prisma 查询）
- IPC 安全暴露（Skill 只能通过受限接口访问）

**Negative:**
- 所有学生状态读写必须经过这一层，是额外抽象
- Memory 接口需要覆盖所有 Skill 的数据需求，设计不全会阻塞开发
- 如果 Memory 层性能不够，会成为瓶颈
