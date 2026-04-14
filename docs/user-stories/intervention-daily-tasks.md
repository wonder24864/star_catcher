# Intervention Planning Agent + Daily Task Pack 用户故事

## US-049: Intervention Planning Agent

**As a** 系统（Brain cron 触发）
**I want to** 基于学生薄弱知识点数据，自动规划每日干预任务（复习/练习/讲解）
**So that** 学生每天有个性化的学习任务，针对性地补强薄弱环节

**验收标准：**
- [ ] Brain 检测到薄弱知识点后自动触发 Intervention Planning Agent（24h 冷却）
- [ ] Handler 预加载 WeaknessProfile + MasteryState + ParentStudentConfig.maxDailyTasks
- [ ] Agent 调用 generate_daily_tasks Skill 生成结构化任务计划（REVIEW / PRACTICE / EXPLANATION）
- [ ] Handler 解析 Agent 输出，校验 KP ID，clamp 到 maxDailyTasks
- [ ] Handler 在 $transaction 中写入 DailyTaskPack + DailyTask 记录（D17: Handler 写，Agent 不直接写）
- [ ] Agent 通过 MemoryWriteInterceptor 记录干预日志（logIntervention）
- [ ] 幂等：同一学生同一天不重复生成任务包
- [ ] AgentTrace 完整记录每步推理

**边界条件：**
- 今日已有 DailyTaskPack：跳过，不重复生成
- 无 WeaknessProfile 数据：仅基于 MasteryState 中的实时薄弱 KP 生成
- maxDailyTasks = 0（家长禁用）：跳过任务生成
- Agent 输出的 KP ID 不存在于 DB：过滤掉无效 KP
- Agent 未返回有效任务计划：记录 AgentTrace FAILED，不写 DailyTaskPack

**性能要求：**
- Agent 从触发到完成：< 30s（典型场景 2-3 步循环）
- 不阻塞学生端响应（异步 BullMQ Job）

---

### Agent 专属字段

**Skill 依赖**:
| Skill | 用途 |
|-------|------|
| search-knowledge-points | 搜索前置/关联知识点补充上下文（可选） |
| generate-daily-tasks | AI 根据薄弱数据生成每日任务计划 |

**Agent 循环终止条件**:
- 最大步数: 5
- 决策停止条件: Agent 已生成完整的每日任务计划 JSON
- Token 预算: 12000 tokens

**Skill 失败恢复**:
| 失败场景 | 降级策略 |
|----------|---------|
| generate-daily-tasks 失败 | 标记 Job FAILED，BullMQ retry |
| search-knowledge-points 失败 | 跳过前置分析，直接用 Handler 预加载数据调 generate-daily-tasks |
| 全部 Skill 不可用 | 标记 Job FAILED，BullMQ retry |

**成本约束**:
- 单次 Agent 会话 Token 上限: 12000
- 每日每学生最多触发 1 次（24h 冷却 by Brain）

---

## US-050: 今日任务包

**As a** 学生
**I want to** 查看今天的个性化学习任务列表，逐一完成并标记
**So that** 能系统性地补强薄弱知识点，看到每天的学习进度

**As a** 家长
**I want to** 查看孩子的每日任务完成情况
**So that** 能了解孩子的学习进展

**验收标准：**
- [ ] 学生端显示今日任务列表，三种卡片样式（REVIEW 蓝 / PRACTICE 橙 / EXPLANATION 绿）
- [ ] 每张卡片显示知识点名称、任务内容、完成状态
- [ ] 进度条显示 completedTasks / totalTasks
- [ ] 学生点击"标记完成"后更新任务状态（乐观锁：PENDING → COMPLETED）
- [ ] 全部完成后 DailyTaskPack.status 自动变为 COMPLETED
- [ ] 家长端只读查看（无"标记完成"按钮）
- [ ] ADMIN 可查看任意学生任务
- [ ] 任务历史（最近 7 天）查看
- [ ] 空状态：今天没有任务时显示友好提示
- [ ] i18n: 所有文案覆盖 zh + en

**Router RBAC**:
| 端点 | STUDENT | PARENT | ADMIN |
|------|---------|--------|-------|
| todayTasks | 读自己 | 读孩子 | 读任意 |
| completeTask | 完成自己的 | - | - |
| taskHistory | 读自己 | 读孩子 | 读任意 |
