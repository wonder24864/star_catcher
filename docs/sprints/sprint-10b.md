# Sprint 10b: Learning Brain 编排器 (Week 15)

**Status**: DRAFT

**目标**: 搭建 Learning Brain 事件驱动编排器 — 核心调度逻辑 + AgentDefinition memoryWriteManifest 机制。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 95 | Sprint 10b 用户故事 + Sprint 文件 | US-046 (Learning Brain 事件调度) |
| 96 | AgentDefinition memoryWriteManifest + MemoryWriteInterceptor | AgentDefinition 接口扩展；IPC handler 校验 Memory 写入白名单；拦截器钩子（pre/post write） |
| 97 | Learning Brain BullMQ 定时任务 | Schedule Registry 注册 `learning-brain` cron `0 6 * * *`；Redis `SETNX brain:student:{id}` TTL 5min |
| 98 | Learning Brain orchestrator 核心 | `src/lib/domain/brain/learning-brain.ts`：读 Memory -> 判断需哪些 Agent -> enqueue jobs -> AdminLog 记录 |
| 99 | Sprint 10b 集成验证 | Brain cron 触发 + 骨架日志验证；memoryWriteManifest 对现有 Agent 生效；npm test + tsc --noEmit |

## 设计要点

- Learning Brain **不是** Agent，是**确定性编排逻辑**（纯代码 if/else + DB 查询），不调用 AI。见 CLAUDE.md Rule 8
- Brain 每次运行扫描一个学生，通过 Redis lock 保证不并发。设计决策见 PHASE3-LAUNCH-PLAN.md §六 D11-D13
- Brain 的输出是 BullMQ jobs（`intervention-planning`, `mastery-evaluation`），不直接执行 Agent
- memoryWriteManifest 对现有 Agent（question-understanding, diagnosis）追加声明，确保机制生效
- memoryWriteManifest 机制详见 PHASE3-LAUNCH-PLAN.md §七

## 验证清单

- [ ] Brain cron 注册成功（Schedule Registry）
- [ ] Brain 骨架运行：扫描学生 -> AdminLog action=`brain-run`
- [ ] Redis lock 防并发：同一学生不能并行 Brain
- [ ] memoryWriteManifest 拦截非白名单 Memory 写入
- [ ] 现有 Agent 追加 memoryWriteManifest 后测试通过
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
