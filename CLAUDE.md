# Star Catcher - Development Guide

K-12 智能错题本。核心流程：拍照 → AI 识别 → 评分(不给答案) → 学生改正 → 复查 → 按需求助(渐进提示)。

## Tech Stack

Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, tRPC, Prisma, PostgreSQL, Redis, MinIO, Azure OpenAI, BullMQ, next-intl, Docker Compose.

## 文档导航

需要时按需读取，不要一次全读：
- 需求: `docs/REQUIREMENTS.md` | 架构: `docs/ARCHITECTURE.md` | 设计系统: `docs/DESIGN-SYSTEM.md`
- 业务规则: `docs/BUSINESS-RULES.md` | 用户故事: `docs/user-stories/` | ADR: `docs/adr/`
- Sprint 计划: `docs/sprints/` | 路线图: `docs/ROADMAP.md` | 启动计划: `docs/PHASE2-LAUNCH-PLAN.md` | Phase 3: `docs/PHASE3-LAUNCH-PLAN.md`

## Development Rules

### Rule 1: AI Harness Pipeline (MANDATORY)
所有 AI 调用必须经 Harness 管道，禁止直接调用 AIProvider。每个 AI 操作需要三件套：schema + prompt + operation。Skill 模式同理：`schema.json` + `execute.ts`，Skill 内调 AI 仍走 `ctx.callAI()`。See: `docs/adr/001-ai-harness-pipeline.md`

### Rule 2: Code is the Spec
Prisma schema = 数据模型真相源；docker-compose.yml = 基础设施真相源；TypeScript interfaces = AI 契约真相源。代码与文档冲突时，更新文档。See: `docs/adr/002-prisma-source-of-truth.md`

### Rule 3: i18n Everything
所有用户可见字符串用 next-intl key，AI prompt 用英文 + `{{locale}}` 控制输出语言。See: `docs/adr/007-i18n-prompt-strategy.md`

### Rule 4: Docker Project Name
始终使用 `docker compose -p star-catcher`。容器前缀 `star-catcher-`（app/db/redis/minio）。

### Rule 5: ADR Discipline
改架构决策前先读对应 ADR 并更新。ADR 记录"为什么"。

### Rule 6: Agent + Skill + Memory 合规 (MANDATORY)
详细规则见 ADR，以下为硬性约束摘要：
- Agent 必须有显式终止条件（maxSteps ≤ 10 + Token 预算 + 停止条件）→ `docs/adr/008-agent-architecture.md`
- Skill 在 IPC 沙箱执行，只能用 `callAI` / `readMemory` / `writeMemory` → ADR-008
- Agent/Skill 不能直接 Prisma 写学生表，必须经 Memory 层 → `docs/adr/010-student-memory-layer.md`
- 所有 function call 写入 AgentTrace（审计链）；Skill bundle 禁止 Prisma import（架构测试强制）

### Rule 7: 解决问题，不绕过问题 (MANDATORY)
遇到难题直面解决，禁止绕过。不用 `any`/`@ts-ignore` 压制错误，不禁用失败测试，不用宽泛 catch 吞错误。无法解决时停下来向用户说明根因，尝试 3 次未果则停止讨论。

### Rule 8: Learning Brain 纪律 (MANDATORY)
- Brain 是确定性代码，**不调用 AI Provider**（不走 Harness 管道）
- Brain 执行必须持有 per-student Redis lock（`SETNX brain:student:{id}`, TTL 5min）
- Agent 输出的 Memory 写入建议须经 Brain/handler 验证后执行（Agent 不直接写 Memory）
- Brain 日志写入 AdminLog，action=`brain-run`，details 包含 `{ studentId, eventsProcessed, agentsLaunched, duration }`
- See: `docs/adr/011-learning-closed-loop.md` D11-D13

### Rule 9: Handler Registry + Schedule Registry (MANDATORY)
- Worker job 路由使用 `JOB_HANDLERS` 注册表（`Record<AIJobName, JobHandler>`），禁止 switch 路由
- 定时任务声明在 `SCHEDULE_REGISTRY`，Worker 启动时自动注册 `queue.upsertJobScheduler()`
- 新增 job 只加映射，不改路由代码
- See: `docs/adr/011-learning-closed-loop.md` (Handler Registry + Schedule Registry)

## Session 恢复

| 用户说 | 做什么 |
|--------|--------|
| "继续开发" / "项目状态" | git log -5 + git status + 读 Sprint 文件 + npm test → 汇报等确认 |
| "继续任务" / "继续" | git log -3 + git status + 读 Sprint 文件 → 找下一个 `[ ]` 直接开始 |
| "实现 Task-N" / "修 bug" | 同上，直接开始指定任务 |
| "开始 Sprint N" | 读 sprint-N.md → 从第一个未完成任务开始 |

## 工作纪律

**优雅完整落地**：实现要优雅、可完整落地，不要怕改造现有代码。如果现有模式不够好或无法完整支撑新需求，主动重构使其与新实现一致（例如：把手动白名单统一迁移到 interceptor 模式），不因"改动面大"而妥协实现质量。每个 Task 的实现都应该是可以直接合入主干的完整状态。

**节省 token**：不用 Explore agent 探索已熟悉的模式，直接 Read；编写新文件前只读一个同类模板；实现某个 task 时只读相关 ADR 章节，不要全文读取。

**测试**：改了 router/operation/harness/skill/memory 后立即跑该文件单测；任务完成时跑全量测试。

**Sprint 自审**：每个 Sprint 结束时执行自审清单（详见当前 Sprint 文件的验证清单部分）。检查项：无 `any` 类型、Prisma 软删除全局过滤、乐观锁、i18n 覆盖、无密钥泄露、RBAC 中间件。

**任务完成时 5 步锁定**：
1. **self-review**：通读本次所有改动，检查逻辑错误、遗漏边界、命名一致性、安全问题
2. commit（`feat(US-NNN): 描述` 或 `feat(sprint-N/task-N): 描述`）
3. **勾选 sprint 文件**：任务 checkbox + **验证清单 checkbox** 全部勾选，Status 改为 COMPLETED（任务做完 ≠ 验证清单勾了，两者必须分别确认）
4. test.todo() → 真实测试并通过
5. 同步文档（README 目录树中文 + ROADMAP 状态）
