# Sprint 4b: Agent Runner + 组件 + Schema (Week 8)

## 目标

基于 Sprint 4a 的 Skill 插件系统，构建 Agent Runner 和 Phase 2 所需的其他基础设施组件。不交付用户功能。

## 用户故事范围

无用户故事。本 Sprint 是技术验证 Sprint。

> **提醒**：Sprint 5 开始时需编写 US-031~034 的完整用户故事（见 ROADMAP.md Phase 2 待完成事项）。

## 任务清单

### Week 8

- [x] 43. Agent Runner 原型
  - Function calling 循环（通过 Schema Adapter 兼容多 Provider）
  - 从 SkillRegistry 动态组装 tools 数组
  - 调用 Skill 通过 SkillRuntime（IPC 沙箱）
  - 产出：Agent Runner 核心代码 + ≥ 3 步循环集成测试

- [x] 44. AgentStepLimiter + CostTracker
  - 最大步数限制 + Token 预算追踪
  - 超限强制终止 Agent 循环
  - 产出：两个 Harness 组件 + 终止边界测试

- [x] 45. CircuitBreaker 组件
  - 连续失败计数 → 熔断 → 半开 → 恢复
  - 多 Provider 降级切换
  - 产出：组件代码 + 状态机测试

- [x] 46. Knowledge Graph schema + 存储验证
  - Prisma: KnowledgePoint, KnowledgeRelation, QuestionKnowledgeMapping
  - recursive CTE 性能测试
  - 产出：schema + migration + 性能数据 → 更新 ADR-009

- [ ] 47. Student Memory schema + Memory 层
  - Prisma: MasteryState, ReviewSchedule, InterventionHistory
  - Memory 层实现：掌握度状态机 + IPC 暴露接口
  - 产出：schema + migration + Memory 层代码 + 状态机测试

- [ ] 48. Agent Trace 数据层
  - Prisma: AgentTrace, AgentTraceStep
  - AgentTracePublisher（步骤状态推送，复用 Redis Pub/Sub + SSE）
  - 产出：schema + 发布器代码 + 推送测试

- [ ] 49. Prompt 版本管理扩展
  - PromptManager 增加 version 字段
  - AICallLog 记录 prompt 版本号
  - 产出：代码修改 + 测试

- [ ] 50. SemanticCache 可行性评估
  - pgvector 安装 + embedding 存储 + 相似度查询
  - 目标：相似度查询延迟 < 50ms
  - 产出：可行性报告（通过/不通过 + 替代方案）

## 验证清单

- [ ] Agent Runner 完成 ≥ 3 步 function calling 循环（使用 IPC 沙箱 Skill）
- [ ] AgentStepLimiter 超步数时终止 Agent
- [ ] CostTracker 超预算时阻止 AI 调用
- [ ] CircuitBreaker 连续失败后切换降级
- [ ] Knowledge Graph recursive CTE 查 5 层前置链 < 100ms
- [ ] Student Memory 状态机拒绝非法转换（如 NEW_ERROR → MASTERED）
- [ ] AgentTrace + AgentTraceStep 记录完整执行链
- [ ] PromptManager version 写入 AICallLog
- [ ] SemanticCache: pgvector 查询 < 50ms（或记录不可行原因）

## ADR 产出

| ADR | Sprint 4 前状态 | 预期 Sprint 4b 后状态 |
|-----|-----------------|---------------------|
| ADR-008 Agent + Skill 插件 | Accepted | 确认沙箱方案 |
| ADR-009 Knowledge Graph Storage | Proposed | Accepted（含方案选择和性能数据）|
| ADR-010 Student Memory Layer | Accepted | 确认接口设计 |
| ADR-011 学习闭环 | Accepted | 无变化 |

## 完成定义

- 所有任务 checkbox 勾选
- 验证清单全部通过
- ADR 状态更新
- `npm test` 通过（含新增测试）
- `npm run lint` 通过
