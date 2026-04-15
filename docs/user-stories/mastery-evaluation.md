# Mastery Evaluation Agent 用户故事

## US-053: 掌握评估 Agent

**As a** 系统（DailyTask PRACTICE 完成 / Brain overdue 触发）
**I want to** 综合学生近期答题表现、复习历史与当前干预记录，判断知识点掌握度变化并给出 SM-2 调整建议
**So that** MasteryState 状态转换与复习间隔能贴合学生真实学习节奏，而非仅靠累计正确率

**验收标准：**
- [ ] 触发条件：PRACTICE 任务完成且 masteryAfter.status === REVIEWING 时由 `daily-task.submitPracticeAnswer` enqueue；或 Learning Brain 发现 overdue review 时 enqueue
- [ ] Handler 预加载：MasteryState / ReviewSchedule / 最近 5 条 InterventionHistory / 近 7 天该 KP 的 DailyTask 完成项 / masterySpeed / currentWorkload
- [ ] Agent 调用 `evaluate_mastery` Skill（必调），按需调用 `get_intervention_history`（查更早历史）、`search_knowledge_points`（查前置 KP）
- [ ] Agent 输出结构化 JSON `{ recommendedTransition: {from,to,reason} | null, sm2Adjustment: {errorType,intervalMultiplier} | null, summary }`
- [ ] Handler 验证后写 Memory（D17）：
  - `recommendedTransition` 非 null → `memory.updateMasteryState(from,to)`；捕获 `InvalidTransitionError`（状态漂移）与 `OptimisticLockError`（并发冲突）并记 AdminLog
  - 目标态 MASTERED → `memory.scheduleReview(interval=365)`（暂停复习）
  - 目标态 REVIEWING 且 sm2Adjustment 非 null → `calculateHybridReview` → `memory.scheduleReview(hybrid.interval, ...)`
  - 所有路径末尾 `memory.logIntervention(type=REVIEW, content={agentReasoning, transition, sm2Adjustment, hybrid})`
- [ ] 非白名单 Memory 写入被 `MemoryWriteInterceptor` 拦截（memoryWriteManifest=[]）→ step FAILED 但不终止 trace
- [ ] 幂等：相同 `sessionId=masteryEval-${studentId}-${kpId}-${reviewScheduleId}` + 1 小时内成功 AgentTrace 存在则跳过
- [ ] AgentTrace 完整记录每步推理；`logAdminAction("brain-run","mastery-evaluation",...)` 审计

**边界条件：**
- `recommendedTransition === null` 且 `sm2Adjustment === null` → 仅写 InterventionHistory 审计，状态与调度不变
- `recommendedTransition === null` 且 sm2Adjustment 非 null → 仅调整 ReviewSchedule，MasteryState 不变
- 状态漂移（from 与 DB 当前 status 不一致）→ 跳过 transition，记 AdminLog `{ rejected: "state-drift" }`，不抛错
- 并发冲突（OptimisticLockError）→ Job throw，由 BullMQ 自动重试（attempts=2）
- MasteryState archived 或不存在 → skip job
- PRACTICE 非 REVIEWING 状态（NEW_ERROR/CORRECTED/MASTERED/REGRESSED）→ 不触发 mastery-evaluation（避免过早介入，由 Memory 层原生状态机处理）
- REVIEW 任务完成（`mastery.submitReview`）→ 不触发 mastery-evaluation（仍走 SM-2 纯路径，保持 US-040 契约）

**性能要求：**
- Agent 从触发到完成：< 30s（典型 1-2 步循环）
- Handler 幂等查询 < 200ms（sessionId 已有索引）
- 不阻塞学生端响应（BullMQ 异步 Job）

---

### Agent 专属字段

**Skill 依赖**:
| Skill | 用途 |
|-------|------|
| evaluate_mastery | AI 综合评估掌握度，输出 transition + sm2Adjustment（核心必调） |
| get_intervention_history | 可选：查询超过预加载 5 条之外的历史记录 |
| search_knowledge_points | 可选：查前置 KP，辅助判断"掌握差是否因前置薄弱" |

**Agent 循环终止条件**:
- 最大步数: 6
- 决策停止条件: Agent 已产出 recommendedTransition 或确认无需变化
- Token 预算: 10000 tokens

**Memory 写入清单**:
- （空）— D17：Agent 不直接写 Memory，仅输出建议；Handler 验证后经 Memory 层执行

**Brain 触发条件**（Brain 相关流程）:
| 触发事件 | 执行动作 |
|---------|---------|
| DailyTask PRACTICE 完成 && masteryAfter.status === REVIEWING | `enqueueMasteryEvaluation(studentId, kpId, reviewScheduleId)` |
| Brain 检测到 overdue review（ReviewSchedule.nextReviewAt <= now） | `enqueueMasteryEvaluation(...)` per overdue KP |

**Skill 失败恢复**:
| 失败场景 | 降级策略 |
|----------|---------|
| evaluate_mastery 失败 | Job FAILED，BullMQ 重试；兜底 Brain 下轮再排 |
| get_intervention_history 失败 | Agent 继续（历史仅为增强信息） |
| search_knowledge_points 失败 | Agent 继续（前置 KP 为辅助信号） |

**成本约束**:
- 单次 Agent 会话 Token 上限: 10000
- 同一 reviewScheduleId 1 小时内幂等（handler 层限流）
