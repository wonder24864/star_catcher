# Sprint 10a: SemanticCache + ObservabilityTracer 基础设施 (Week 14)

**Status**: DRAFT

**目标**: 搭建 Phase 3 基础设施前半 — SemanticCache 集成 + OpenTelemetry 观测 + BullMQ Handler/Schedule Registry 重构。

## 任务清单

| # | 任务 | 产出 |
|---|------|------|
| 89 | Sprint 10a 用户故事 + Sprint 文件 | US-044 (SemanticCache 集成)、US-045 (ObservabilityTracer) |
| 90 | DB 迁移：新增模型 + 字段扩展 | Prisma migration（详见 `docs/phase3-db-schema.md`） |
| 91 | SemanticCache Harness 组件 | SemanticCache 接入 Harness 管道；pgvector 启用（`CREATE EXTENSION vector`） |
| 92 | ObservabilityTracer Harness 组件 | OpenTelemetry SDK 集成；Harness 管道新增 ObservabilityTracer 组件；AI 调用链完整 trace span；导出到 Jaeger（Docker 新增 jaeger 服务） |
| 93 | BullMQ Handler Registry + Schedule Registry + 新 job types | Worker switch -> `JOB_HANDLERS` 注册表；新增 `SCHEDULE_REGISTRY` 声明式定时任务；新增 6 个 AIOperationType 枚举值 + 4 个 job type |
| 94 | Sprint 10a 集成验证 | SemanticCache 端到端（embedding 写入+查询）；OTel span 在 Jaeger 可视化；Handler Registry 路由所有现有 job；npm test + tsc --noEmit |

## 设计要点

- **SemanticCache**: Harness 管道新组件，基于 pgvector brute-force（Spike 验证 < 50ms @ 5000 条）。设计决策见 PHASE3-LAUNCH-PLAN.md §四 D19
- **ObservabilityTracer**: `@opentelemetry/sdk-node` + `@opentelemetry/exporter-trace-otlp-http`；Harness 每个组件 wrap 一个 span（name=组件名, attributes={operationType, userId, tokens}）；AgentRunner 每步一个 child span；docker-compose 新增 Jaeger all-in-one（端口 16686 UI / 4318 OTLP）。设计决策见 §四 D21
- **Handler Registry**: `Record<AIJobName, JobHandler>` 替代 switch，与 SkillRegistry / OperationRegistry 模式一致。见 CLAUDE.md Rule 9
- **Schedule Registry**: `SCHEDULE_REGISTRY` 数组声明所有 repeatable jobs，Worker 启动时遍历注册。见 CLAUDE.md Rule 9

## 验证清单

- [ ] SemanticCache 端到端：embedding 写入 + cosine 查询返回相似结果
- [ ] OTel span 在 Jaeger UI 可视化（Harness 组件 + AgentRunner 步骤）
- [ ] Handler Registry 路由所有现有 job（无 switch 残留）
- [ ] Schedule Registry 注册 learning-brain + weakness-profile cron
- [ ] npm test 全量通过
- [ ] tsc --noEmit 无错误
- [ ] 无 `any` 类型、无 `@ts-ignore`
- [ ] i18n 新增 key 覆盖 zh + en
