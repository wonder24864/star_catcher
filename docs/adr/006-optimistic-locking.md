# ADR-006: Optimistic Locking with updatedAt Instead of Pessimistic Locks

## Status
Accepted (2026-04-08)

## Context
A parent and student may interact with the same HomeworkSession concurrently. The student submits corrections while the parent reviews the session or modifies recognition results. Similarly, batch question updates (`homework.batchUpdateQuestions`) and help requests (`homework.requestHelp`) can overlap. Pessimistic locking (SELECT FOR UPDATE) would serialize all writes, adding latency and risking deadlocks in a system where write conflicts are expected to be rare -- most of the time, only one person is actively modifying a session. The system runs on PostgreSQL via Prisma ORM, which does not natively expose row-level advisory locks.

## Decision
Use optimistic locking via the `updatedAt` timestamp field that Prisma auto-manages with `@updatedAt`. The pattern for write operations:

1. Read the current entity, capturing its `updatedAt` value.
2. Perform the Prisma `update` with a `WHERE` clause that includes both `id` and `updatedAt`.
3. If zero rows are affected (another write changed `updatedAt` between read and write), throw a conflict error with i18n key `error.dataConflict`.
4. The frontend displays a localized message: "Data has been modified by another user. Please refresh and try again."

Operations that use this pattern: `homework.submitCorrection`, `homework.batchUpdateQuestions`, and `homework.requestHelp`.

Read operations (parent viewing session details, student browsing error list) require no locking. Parents see the latest committed state on page refresh.

## Consequences

**Positive:**
- Simple implementation: no database-level lock management, no advisory lock cleanup, no deadlock risk.
- Works naturally with Prisma's `@updatedAt` decorator, requiring no additional columns or infrastructure.
- Read operations are never blocked, which is important for the parent monitoring use case where reads heavily outnumber writes.
- Conflict resolution is explicit and user-friendly: the user sees a clear message and refreshes, rather than experiencing mysterious timeouts.
- Sufficient for the expected concurrency level (family use, 1-2 simultaneous users per session).

**Negative:**
- In the rare case of a genuine conflict, the user loses their in-progress edit and must redo it after refreshing. There is no merge strategy.
- If write contention increases (e.g., a teacher role modifying many students' sessions in Phase 4+), the conflict rate could become annoying. At that point, more granular locking or conflict resolution may be needed.
- The pattern requires discipline: every write procedure on shared entities must include the `updatedAt` check. Missing it in a new endpoint would silently allow lost updates.
