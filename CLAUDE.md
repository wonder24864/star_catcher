# Star Catcher - Development Guide

## Project Overview

K-12 intelligent error notebook system. Family-focused (students + parents + admin).
Core flow: Photo -> AI recognize -> score (no answers) -> student corrects -> re-check -> help on request (progressive reveal).

## Documentation Map

| Document | Path | Purpose |
|----------|------|---------|
| Requirements | `docs/REQUIREMENTS.md` | All-phase requirements, stable |
| Architecture | `docs/ARCHITECTURE.md` | AI Harness pipeline, async tasks, routing, error handling, **Agentic 演进路线 (Section 6)** |
| Design System | `docs/DESIGN-SYSTEM.md` | UI themes, components, responsive breakpoints |
| Business Rules | `docs/BUSINESS-RULES.md` | Edge cases, scoring, dedup, locking, help levels |
| User Stories | `docs/user-stories/` | Per-module acceptance criteria (9 files) |
| ADRs | `docs/adr/` | Architecture Decision Records (7 files) |
| Sprint Plans | `docs/sprints/` | Sprint-scoped task lists + acceptance criteria |
| Original PRD | `docs/archive/PRD-Phase1-original.md` | Archived monolithic PRD (reference only) |

> **When working on a feature**: Read the relevant user story file + sprint file + any referenced ADRs or business rules. You should NOT need to read all docs at once.

## Tech Stack

Next.js 14+ (App Router), TypeScript, Tailwind CSS, shadcn/ui, tRPC, Prisma, PostgreSQL, Redis, MinIO, Azure OpenAI GPT-5.4, BullMQ, next-intl, Docker Compose.

## Development Rules

### Rule 1: AI Harness Pipeline (MANDATORY)

**All AI calls MUST go through the Harness pipeline. NEVER call AIProvider directly from business code.**

```
Business Code -> Operations Layer -> AI Harness Pipeline -> AI Provider
```

Every AI operation needs 3 files:
1. `src/lib/ai/harness/schemas/<operation>.ts` — Zod output schema
2. `src/lib/ai/prompts/<operation>.ts` — Versioned prompt template
3. `src/lib/ai/operations/<operation>.ts` — Business-facing orchestration

See: `docs/adr/001-ai-harness-pipeline.md`

### Rule 2: Code is the Spec

- `prisma/schema.prisma` is the source of truth for data models (not docs)
- `docker-compose.yml` and `.env.example` are the source of truth for infra config
- TypeScript interfaces in `src/lib/ai/` are the source of truth for AI contracts
- When code and docs diverge, update docs to match code

See: `docs/adr/002-prisma-source-of-truth.md`

### Rule 3: i18n Everything

- All user-visible strings use next-intl i18n keys (never hardcoded)
- AI prompts use English with `{{locale}}` variable for output language control
- Translation files: `messages/zh.json` and `messages/en.json`

See: `docs/adr/007-i18n-prompt-strategy.md`

### Rule 4: Docker Project Name

**Always use project name `star-catcher`** to avoid conflicts with other containers:
```bash
docker compose -p star-catcher up -d
```
The `docker-compose.yml` has `name: star-catcher` at top level.

### Rule 5: ADR Discipline

Before changing an architectural decision, read the relevant ADR in `docs/adr/` and update it. ADRs capture the "why" — changing the decision without updating the ADR loses institutional knowledge.

## Sprint Self-Review

After completing each Sprint, run this checklist. This is NOT optional.

### Review A: Acceptance Criteria
```bash
npm run test:acceptance -- --grep "sprint-N"
```
All test stubs for the sprint's user stories should be implemented and passing.

### Review B: AI Harness Integrity (Sprint 2+)
```bash
npm run test:architecture
```
Automated checks: no direct AIProvider imports, Zod schemas exist, i18n coverage.

### Review C: Manual Checks
- [ ] No `any` types in AI-related code
- [ ] Soft-delete filtering is global (Prisma $extends)
- [ ] Optimistic locking WHERE clauses on write operations
- [ ] All new UI strings have zh/en translations
- [ ] No secrets in code or git history
- [ ] RBAC middleware active on all protected routes

## Session 恢复协议

**新 session 开始时，根据用户指令选择恢复模式。**

### 模式 A：完整恢复（用户说"继续开发"或"项目状态"）

适用于不确定项目状态、长时间未工作、或需要全面检查时。

**步骤 1**：读取客观状态（并行执行）
```bash
git log --oneline -10
git status
git diff --stat
```

**步骤 2**：读当前 Sprint 文件，确定已完成/未完成任务

**步骤 3**：运行测试
```bash
npm test 2>/dev/null || echo "测试框架尚未初始化"
```

**步骤 4**：汇报状态（3-5 行），等用户确认方向

### 模式 B：快速恢复（用户说"继续任务"或直接指定任务）

适用于短暂中断后继续、明确知道要做什么时。**省 token，优先使用。**

**步骤 1**：只跑以下两条（并行）：
```bash
git log --oneline -5
git status
```

**步骤 2**：读当前 Sprint 文件，找到下一个 `[ ]` 任务

**步骤 3**：直接报告下一个任务是什么，立即开始工作。不跑测试、不做完整汇报。

### 模式选择规则

| 用户说 | 模式 |
|--------|------|
| "继续开发" / "项目状态" | 模式 A（完整恢复） |
| "继续任务" / "继续" | 模式 B（快速恢复）→ 直接开始下一个任务 |
| "实现 Task-N" / "实现 US-NNN" | 模式 B → 直接开始指定任务 |
| "开始 Sprint N" | 模式 A → 读 sprint-N.md → 从第一个未完成任务开始 |
| "跑自审" | 模式 A → 执行 Sprint 自审清单 |
| "修 xxx 的 bug" | 模式 B → 读相关代码 → 修复 |

### 工作中的节省规则

- **不要用 Explore agent 探索已熟悉的代码模式**。直接 Read 2-3 个样板文件即可。
- **编写新文件前**，只读一个同类文件作为模板，不要读所有同类文件。
- **测试只在任务完成时跑**，不在任务开始时跑（模式 B）。

### 工作结束时

每个 Sprint 任务完成后：
1. **必须 commit**，消息格式：用户故事用 `feat(US-NNN): 简短描述`，基础设施任务用 `feat(sprint-N/task-N): 简短描述`
2. **必须勾选** `docs/sprints/sprint-N.md` 中对应的 checkbox
3. **必须把 test.todo() 变成真正的测试**，确保通过

这 3 步是质量锁定机制 — commit 锁定代码、checkbox 锁定进度、测试锁定行为。任何一步都不可跳过。

## Container Names

All Docker containers use `star-catcher-` prefix:
- `star-catcher-app` (Next.js)
- `star-catcher-db` (PostgreSQL)
- `star-catcher-redis` (Redis)
- `star-catcher-minio` (MinIO)
