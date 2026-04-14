# Learning Brain 用户故事

## US-046: Learning Brain 事件调度

**As a** 系统（自动触发）
**I want to** 每日自动扫描每个学生的学习状态，判断需要启动哪些 Agent（干预规划/掌握评估），并自动排队执行
**So that** 学生能持续获得针对性的学习干预，无需人工触发

**验收标准：**
- [ ] BullMQ cron 每日触发 Learning Brain（时间可配置，默认 UTC 22:00 = 北京 6:00）
- [ ] Brain 为每个活跃学生独立运行，通过 Redis SETNX 防并发（TTL 5min）
- [ ] Brain 是确定性代码，不调用 AI Provider
- [ ] Brain 读取 Memory 层（弱点 + 过期复习）做出决策
- [ ] 弱点存在时排入 `intervention-planning` 任务
- [ ] 过期复习存在时排入 `mastery-evaluation` 任务（逐 KP 独立）
- [ ] 24h 冷却机制：同一学生 24h 内不重复触发 intervention-planning
- [ ] 每次运行写入 AdminLog action=`brain-run`
- [ ] memoryWriteManifest 拦截非白名单的 Memory 写入

**边界条件：**
- 学生无 MasteryState 记录：不参与 Brain 扫描
- 学生全部 KP 已 MASTERED 且无过期复习：跳过
- Redis lock 获取失败：跳过该学生（其他 Brain 实例正在处理）
- 24h 内已运行 intervention-planning：跳过并记录 skip 原因
- AdminLog system 用户不存在：warn 但不崩溃

**性能要求：**
- 单个学生 Brain 决策：< 2s
- Redis lock TTL：5 分钟（防止崩溃后死锁）

---

### Brain 决策逻辑

Brain 不是 Agent，不使用 Agent Runner，是纯 if/else 确定性代码。

**决策流程**:
1. 读取弱点（MasteryState status = NEW_ERROR / CORRECTED / REGRESSED）
2. 读取过期复习（ReviewSchedule nextReviewAt <= now）
3. 检查 24h 冷却（AgentTrace 最近 24h intervention-planning 记录）
4. 弱点 + 无冷却 → 排 intervention-planning
5. 每个过期复习 → 排 mastery-evaluation

**活跃学生定义**:
- MasteryState 状态非全部 MASTERED 的学生
- 或有过期 ReviewSchedule 的学生

**触发方式**:
| 方式 | 说明 |
|------|------|
| Cron 触发 | BullMQ RepeatableJob，`studentId: "__all__"` → 扇出为逐学生 job |
| 手动触发 | Admin 可手动 enqueue 指定 studentId 的 brain job |

**memoryWriteManifest 机制**:
| Agent | manifest | 说明 |
|-------|----------|------|
| question-understanding | `[]` | 不写 Memory |
| diagnosis | `["logIntervention"]` | 只写诊断干预记录 |
| intervention-planning | `["logIntervention"]` | 只写干预记录（Sprint 12） |
| mastery-evaluation | `[]` | 输出建议，handler 验证后写（Sprint 14） |
