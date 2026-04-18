# ADR-013: Global Task Progress System

**Status**: Accepted — 2026-04-18
**Supersedes partially**: per-component `useState`/`isPending` for long-running mutations

## Context

Star Catcher has six kinds of long-running user-triggered jobs: OCR 识别,
改正评分, 求助提示, 家长建议, Eval 评估, Brain 运行. Before this change, each
button owned its own `useState`/`isPending` loading flag, tied to the
component's lifecycle.

That had three problems:

1. **Button state died on navigation.** A user who clicked "开始识别" and
   navigated to `/dashboard` came back to an enabled button — they could
   re-trigger a still-running job.
2. **Progress was invisible off-route.** To see "AI 识别中 … 35%" the user
   had to stay on the origin page. The existing SSE subscription's lifetime
   was bound to the component that mounted it.
3. **Nothing survived refresh.** A tab reload lost all in-flight state.

We already had the raw infrastructure for async jobs (BullMQ + Redis
pub/sub + tRPC subscriptions; see [ADR-003](./003-bullmq-async-ai.md)),
but no cross-route UX layer sat on top.

## Decision

Introduce three coupled pieces that together form the "presentation layer"
for the existing async pipeline:

1. **`TaskRun` Prisma model** — one row per user-triggered long-running
   job, tracks lifecycle (QUEUED → RUNNING → COMPLETED/FAILED) + current
   step + progress. Created inside the tRPC mutation *before* `enqueue*()`,
   updated at each worker phase via `@/lib/task-runner` helpers.
2. **User-wide SSE channel** `task:user:{userId}` — workers publish
   `TaskProgressEvent` on every state change. A single tRPC subscription
   (`task.onUserTaskUpdate`) carries all six job types for the current user.
3. **Zustand `taskStore` + `<TaskProvider>` + `<ActiveTasksDock>`** —
   mounted once in the root layout. Hydrates from `task.listActive` on
   mount and on visibility/reconnect; merges SSE events; pins active
   tasks to a bottom-right floating dock visible on every route. Buttons
   read `useTaskLock(key)` to stay disabled until the task terminates.

`TaskRun` is **not** a business truth source. `HomeworkSession.status`,
`EvalRun.status`, `LearningSuggestion` rows remain authoritative for
their domains — they're the immutable record of what the user ultimately
got. `TaskRun` is the *session/presentation* layer metadata: "is there
an in-flight operation for this key, and how close to done?"

## Alternatives considered

- **Reuse `HomeworkSession.status` and friends** for the UI lock.
  Rejected: 求助 and Brain have no natural per-call status table; adding
  one per feature is more schema churn and no better UX.
- **Fold into the existing per-channel SSE** (`session:{id}`,
  `help:{sid}:{qid}`, `learning-suggestion:{studentId}`). Rejected:
  those channels carry fat business payloads (OCR results, markdown
  hints). Every route would need to subscribe to every variant, and the
  user-wide broadcast would bloat. Keeping a *thin* metadata channel
  orthogonal to the fat domain channels is the clean split.
- **No DB persistence, Redis + localStorage only.** Rejected: the user
  explicitly asked for "回来后按钮不能点" across *刷新 / 跨设备*. That
  needs server-side truth; Redis evicts, localStorage is per-device.
- **Partial unique index `(userId, key) WHERE status IN (QUEUED,
  RUNNING)`**. Rejected: Prisma schema syntax doesn't express it, and
  application-level idempotency (`listActive` check in the mutation)
  is simpler. Audit history with any number of terminated rows for the
  same key is actually useful.
- **Include `CANCELLED` in the status enum now.** Rejected (Rule 8):
  no code path produces CANCELLED yet; adding it would be a dead signal
  that rots.

## Consequences

**Positive:**
- One place to reason about all in-flight tasks. Adding a 7th job type
  means: new `TaskType` enum value, one `createTaskRun` in the mutation,
  three `taskrunner` calls in the handler, one i18n block. No new
  subscription, no new dock, no new store.
- Cross-device continuity: same user on phone + laptop both see the
  dock and locked buttons.
- Visibility change refetch catches SSE drops the user never saw.

**Negative:**
- One extra DB row + publish per job start/step/end. Measured: ~4–6 row
  updates per OCR job, all small. Postgres easily absorbs; Redis pub/sub
  is negligible.
- Two SSE subscriptions per session (`task.onUserTaskUpdate` global +
  the legacy per-domain ones that carry payload). Acceptable: tRPC SSE
  pings every 3s, reconnect ≤5s, no 2x cost on payload path.
- Buttons need `useTaskLock(key)` + `useStartTask(...)` wiring. Handled
  by a shared hook module so each migration is 5–10 lines.

## Rule alignment

- **Rule 1** (Harness): handlers still invoke AI through the Harness.
  `task-runner` only records state transitions.
- **Rule 2** (Prisma truth source): `TaskRun` added to `schema.prisma`,
  migration `20260418010001_add_task_run` applied.
- **Rule 3** (i18n): all step/toast/dock/type strings live in
  `messages/{zh,en}.json` under `task.*`.
- **Rule 7** (solve, don't bypass): SSE drop is reconciled via
  `listActive.refetch()` on visibility — not silenced.
- **Rule 8** (unused = design signal): `CANCELLED` left out until a path
  writes it. All new fields consumed end-to-end.
- **Rule 9** (Brain discipline): Brain still takes its per-student
  Redis lock. `task-runner` calls are deterministic DB + publish, no AI.
- **Rule 10** (Handler Registry): no new BullMQ job types; only existing
  handlers were augmented with task-runner calls.

## Files

**Added**
- `prisma/migrations/20260418010001_add_task_run/migration.sql`
- `src/lib/task-runner/index.ts`
- `src/lib/stores/task-store.ts`
- `src/components/providers/task-provider.tsx`
- `src/components/task/active-tasks-dock.tsx`
- `src/hooks/use-task.ts`
- `src/server/routers/task.ts`

**Modified**
- `prisma/schema.prisma` (+ `TaskRun`, `TaskType`, `TaskStatus`)
- `src/lib/infra/events.ts` (+ `userTaskChannel`, `TaskProgressEvent`,
  `publishTaskEvent`, `subscribeToUserTasks`)
- `src/lib/infra/queue/types.ts` (+ optional `taskId` on six job data
  types)
- `src/server/routers/{_app,homework,parent,eval,brain}.ts`
- `src/worker/handlers/{ocr-recognize,correction-photos,help-generate,learning-suggestion,eval-run,learning-brain}.ts`
- `src/app/[locale]/layout.tsx` (mounts `<TaskProvider>` + `<ActiveTasksDock>`)
- `src/i18n/messages/{zh,en}.json` (+ `task.*`)
- Six button sites in `src/app/[locale]/(dashboard)/**`
