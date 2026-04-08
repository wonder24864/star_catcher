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

## Session 恢复协议（纯客观恢复）

**每个新 session 开始时，无论用户说什么，都必须先执行以下恢复流程。这是强制的，不可跳过。**

### 步骤 1：读取客观状态（并行执行）

```bash
git log --oneline -20                    # 知道最近做了什么
git status                               # 知道有没有未提交的工作
git diff --stat                          # 知道改了哪些文件
```

### 步骤 2：读取 Sprint 进度

读当前 Sprint 文件（`docs/sprints/sprint-N.md`），查看 checkbox 勾选状态，确定：
- 哪些任务已完成（`[x]`）
- 哪些任务进行中或未开始（`[ ]`）
- 下一个应该做的任务是什么

### 步骤 3：运行测试（如果已有测试框架）

```bash
npm test 2>/dev/null || echo "测试框架尚未初始化"
```

### 步骤 4：向用户汇报状态

用 3-5 行总结当前项目状态，格式：

```
当前 Sprint: Sprint N
已完成: US-001, US-002, ...
进行中: US-003（上次 commit 到了 xxx）
下一步: [建议的下一个任务]
测试状态: X passed / Y todo / Z failed
```

然后等用户确认方向，再开始工作。

### 步骤 5：工作结束时

每个用户故事（US）实现完成后：
1. **必须 commit**，消息格式：`feat(US-NNN): 简短描述`
2. **必须勾选** `docs/sprints/sprint-N.md` 中对应的 checkbox
3. **必须把 test.todo() 变成真正的测试**，确保通过

这 3 步是质量锁定机制 — commit 锁定代码、checkbox 锁定进度、测试锁定行为。任何一步都不可跳过。

---

## 用户可以说什么来启动工作

> **注意**: 无论用户说什么，都必须先完成步骤 1-4 的恢复协议。以下所有场景都以恢复协议为前置步骤，不可跳过。

| 用户说 | 我做什么 |
|--------|---------|
| "继续开发" | **先执行恢复协议** → 汇报状态 → 建议下一步 |
| "实现 US-013" | **先执行恢复协议** → 读对应用户故事 → 开始实现 |
| "开始 Sprint 2" | **先执行恢复协议** → 读 sprint-2.md → 从第一个未完成任务开始 |
| "跑自审" | **先执行恢复协议** → 执行 Sprint 自审清单 |
| "修 xxx 的 bug" | **先执行恢复协议** → 读相关代码 → 修复 |

## Container Names

All Docker containers use `star-catcher-` prefix:
- `star-catcher-app` (Next.js)
- `star-catcher-db` (PostgreSQL)
- `star-catcher-redis` (Redis)
- `star-catcher-minio` (MinIO)
