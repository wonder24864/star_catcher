# Star Catcher - Development Guide

K-12 智能错题本。核心流程：拍照 → AI 识别 → 评分(不给答案) → 学生改正 → 复查 → 按需求助(渐进提示)。

## Tech Stack

Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, tRPC, Prisma, PostgreSQL, Redis, MinIO, Azure OpenAI, BullMQ, next-intl, Docker Compose.

## 文档导航

需要时按需读取，不要一次全读：
- 需求: `docs/REQUIREMENTS.md` | 架构: `docs/ARCHITECTURE.md` | 设计系统: `docs/DESIGN-SYSTEM.md`
- 业务规则: `docs/BUSINESS-RULES.md` | 用户故事: `docs/user-stories/` | ADR: `docs/adr/`
- Sprint 计划: `docs/sprints/` | 路线图: `docs/ROADMAP.md` | 启动计划: `docs/PHASE2-LAUNCH-PLAN.md` | Phase 3: `docs/PHASE3-LAUNCH-PLAN.md`
- 部署: `deploy/DEPLOY-PROD.md`（含 NAS UI 方案 + CLI 方案）| 开发环境: `deploy/DEPLOY-DEV.md`

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

### Rule 8: 未使用声明 = 设计信号，不是死代码 (MANDATORY)
发现"声明了但没用到"的字段、参数、接口时，**禁止直接删除**。必须先执行追查：
1. **溯源**：这个声明出现在哪个 Sprint/Task/设计文档中？设计意图是什么？
2. **追踪数据流**：从生产者到消费者，走完整条链路。哪一环缺失了？
3. **判定**：
   - 如果是遗漏实现 → 补全逻辑（这是 bug，不是冗余）
   - 如果确实是残留/过时 → 删除，并在 commit message 说明为什么安全删除
4. **禁止**：把"未使用"等同于"多余"然后删除。这会静默吞掉功能需求，而且删除后代码反而更"干净"，review 时更难发现。

**反例（Sprint 12 教训）**：`overdueReviewKPIds` 在 Skill schema 中声明但 execute.ts 未读取。正确做法是追查发现 handler 遗漏了 `getOverdueReviews()` 加载，补全逻辑。错误做法是删除声明，导致 overdue review 优先级逻辑永久丢失。

### Rule 9: Learning Brain 纪律 (MANDATORY)
- Brain 是确定性代码，**不调用 AI Provider**（不走 Harness 管道）
- Brain 执行必须持有 per-student Redis lock（`SETNX brain:student:{id}`, TTL 5min）
- Agent 输出的 Memory 写入建议须经 Brain/handler 验证后执行（Agent 不直接写 Memory）
- Brain 日志写入 AdminLog，action=`brain-run`，details 包含 `{ studentId, eventsProcessed, agentsLaunched, duration }`
- See: `docs/adr/011-learning-closed-loop.md` D11-D13

### Rule 10: Handler Registry + Schedule Registry (MANDATORY)
- Worker job 路由使用 `JOB_HANDLERS` 注册表（`Record<AIJobName, JobHandler>`），禁止 switch 路由
- 定时任务声明在 `SCHEDULE_REGISTRY`，Worker 启动时自动注册 `queue.upsertJobScheduler()`
- 新增 job 只加映射，不改路由代码
- See: `docs/adr/011-learning-closed-loop.md` (Handler Registry + Schedule Registry)

### Rule 11: EvalFramework 纪律 (MANDATORY)
- 新增 `AIOperationType` 枚举值时，**必须**同步在 `tests/eval/datasets/` 添加对应 JSON 数据集文件（3-5 条 cases 或明确的 `unavailableReason`）
- 编译期保险：`DATASET_FILE_MAP: Record<AIOperationType, string>` 是穷举的，漏一个 op 就 `tsc --noEmit` 失败
- 运行期保险：数据集启动期做 Zod 校验（`dataset-schema.ts`），`cases: []` 且无 `unavailableReason` 即拒绝启动
- EVAL_JUDGE 输出用 `evalJudgeSchema.superRefine` 强制 `passed === (score >= 3)`，裁判不能说谎
- `eval-judge` 自身**不参与自评**（避免循环偏差）
- 通过率分母 = `passed / (total - skipped)`，SKIPPED 不阻塞 Phase 验收
- 改 prompt / 切 provider 前，先跑一次 `/admin/eval` 建立基线；切换后对比通过率，低于基线或 < 80% 先修 prompt 再合入
- See: `docs/user-stories/admin-phase3.md` US-058，`docs/sprints/sprint-16.md`

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

**Sprint 自审**：每个 Sprint 结束时执行自审清单（详见当前 Sprint 文件的验证清单部分）。检查项：无 `any` 类型、Prisma 软删除全局过滤、乐观锁、i18n 覆盖、无密钥泄露、RBAC 中间件、**未使用声明溯源**（Rule 8）。

**任务完成时 5 步锁定**：
1. **self-review**：通读本次所有改动，检查逻辑错误、遗漏边界、命名一致性、安全问题、**未使用声明溯源**（发现 unused 先查设计意图，Rule 8）
2. commit（`feat(US-NNN): 描述` 或 `feat(sprint-N/task-N): 描述`）
3. **勾选 sprint 文件**：任务 checkbox + **验证清单 checkbox** 全部勾选，Status 改为 COMPLETED（任务做完 ≠ 验证清单勾了，两者必须分别确认）
4. test.todo() → 真实测试并通过
5. 同步文档（README 目录树中文 + ROADMAP 状态）
