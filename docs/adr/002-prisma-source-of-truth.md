# ADR-002: Prisma Schema as Source of Truth Over Documentation

## Status
Accepted (2026-04-08)

## Context
The Phase 1 PRD contains a complete Prisma schema as a code block, defining models for User, Family, FamilyMember, HomeworkSession, SessionQuestion, CheckRound, RoundQuestionResult, HelpRequest, ErrorQuestion, ParentNote, ParentStudentConfig, AdminLog, SystemConfig, and AICallLog. During development, schema changes are inevitable as edge cases emerge (e.g., adding fields, adjusting indexes, changing enum variants). If the PRD schema is treated as the canonical spec, every migration requires updating the documentation first, then the code -- a workflow that inverts the natural development cycle and guarantees drift between docs and reality.

## Decision
The actual `prisma/schema.prisma` file in the repository is the authoritative definition of the data model. The PRD schema serves as the initial design intent and starting point. When a schema change is needed:

1. Modify `prisma/schema.prisma` directly。
2. 生成并提交 Prisma migration（`prisma migrate dev` 会在 `prisma/migrations/` 下创建新目录）。
   - **重要**：schema 文件和 migration 文件必须一起 commit 到 git。Migration 是 schema 演进的审计记录。
3. 更新受影响的文档以反映变更。

Documentation follows code, not the other way around. Pull requests that modify the schema should include corresponding doc updates, but the schema file is what the application actually uses and what CI validates.

## Consequences

**Positive:**
- Eliminates the class of bugs where documentation says one thing and the database enforces another.
- Prisma Client types are auto-generated from the schema, so TypeScript compilation catches any mismatch between code and data model immediately.
- Developers can iterate on the schema freely during sprints without a documentation-first bottleneck.
- Migrations are the audit trail of schema evolution, more reliable than doc diffs.

**Negative:**
- Documentation can fall behind if developers skip the "update docs" step in PRs. Code review discipline is required to catch this.
- Stakeholders who only read the PRD may have a stale picture of the data model. They must check the schema file or generated docs for current state.
- The PRD schema block becomes a historical snapshot rather than a living spec, which may confuse new team members who assume it is current.
- Soft-delete conventions (`deletedAt` on User, Family, ErrorQuestion) and query patterns (global Prisma Client Extensions for `WHERE deletedAt IS NULL`) are implementation details that live in code, not docs. Any change to which models support soft delete must be reflected in both the schema and the extension configuration.
