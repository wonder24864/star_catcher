/**
 * EvalFramework tRPC Router — Sprint 16 US-058.
 *
 * Admin-only procedures:
 *   - listRuns:      Paginated list of EvalRun summaries
 *   - getRun:        One EvalRun + all its EvalCase rows
 *   - trigger:       Enqueue a new eval-run BullMQ job; returns runId + jobId
 *   - datasetStats:  Per-operation case counts + last run pass rate (for the
 *                    dashboard landing card)
 *
 * See docs/user-stories/admin-phase3.md US-058.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc";
import { logAdminAction } from "@/lib/domain/admin-log";
import { enqueueEvalRun } from "@/lib/infra/queue";
import { createTaskRun } from "@/lib/task-runner";
import {
  DATASET_FILE_MAP,
  loadDataset,
} from "@/lib/domain/ai/eval/dataset-schema";
import type { AIOperationType, PrismaClient } from "@prisma/client";

const AI_OPERATION_TYPES = Object.keys(
  DATASET_FILE_MAP,
) as [AIOperationType, ...AIOperationType[]];

export const evalRouter = router({
  /**
   * List EvalRun rows with pagination. Includes trigger admin nickname.
   */
  listRuns: adminProcedure
    .input(
      z.object({
        status: z.enum(["RUNNING", "COMPLETED", "FAILED"]).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const where = input.status ? { status: input.status } : {};
      const [items, total] = await Promise.all([
        ctx.db.evalRun.findMany({
          where,
          orderBy: { startedAt: "desc" },
          skip: (input.page - 1) * input.pageSize,
          take: input.pageSize,
          include: {
            admin: { select: { id: true, nickname: true, username: true } },
          },
        }),
        ctx.db.evalRun.count({ where }),
      ]);
      return {
        items,
        total,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  /**
   * Return one EvalRun with all its EvalCase rows. Cases may be up to ~60
   * per run, fine to return in one payload.
   */
  getRun: adminProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const run = await ctx.db.evalRun.findUnique({
        where: { id: input.id },
        include: {
          admin: { select: { id: true, nickname: true, username: true } },
          cases: {
            orderBy: [{ operation: "asc" }, { caseId: "asc" }],
          },
        },
      });
      if (!run) {
        throw new TRPCError({ code: "NOT_FOUND", message: "EvalRun not found" });
      }
      return run;
    }),

  /**
   * Trigger a new eval run. Creates an EvalRun row with status=RUNNING,
   * enqueues the eval-run job, and audits the trigger action.
   *
   * `operations` empty/absent = run ALL operations that have a dataset.
   */
  trigger: adminProcedure
    .input(
      z.object({
        operations: z.array(z.enum(AI_OPERATION_TYPES)).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const operations: AIOperationType[] =
        input.operations && input.operations.length > 0
          ? input.operations
          : (Object.keys(DATASET_FILE_MAP) as AIOperationType[]);

      const run = await ctx.db.evalRun.create({
        data: {
          triggeredBy: ctx.session.userId,
          operations,
          status: "RUNNING",
        },
        select: { id: true },
      });

      // Key by trigger shape (all vs one op), not runId — so the client
      // can compute the same key at click time (no round-trip needed) and
      // lock the button optimistically.
      const requested = input.operations ?? [];
      const taskKey =
        requested.length === 0
          ? "eval:all"
          : requested.length === 1
            ? `eval:op:${requested[0]}`
            : `eval:multi:${[...requested].sort().join(",")}`;
      const { task: taskRun, isNew } = await createTaskRun(ctx.db, {
        type: "EVAL",
        key: taskKey,
        userId: ctx.session.userId,
      });

      let jobId = taskRun.bullJobId ?? null;
      if (isNew) {
        jobId = await enqueueEvalRun({
          runId: run.id,
          operations: operations as string[],
          userId: ctx.session.userId,
          locale: ctx.session.locale ?? "zh-CN",
          taskId: taskRun.id,
        });
      }

      await logAdminAction(
        ctx.db as unknown as PrismaClient,
        ctx.session.userId,
        "eval-trigger",
        run.id,
        { operations, jobId },
      );

      return { runId: run.id, jobId, taskId: taskRun.id, taskKey };
    }),

  /**
   * Per-operation dataset stats — shown on the landing card.
   * For each operation: how many cases in dataset, plus the last-run result
   * (if any) for a quick at-a-glance health signal.
   */
  datasetStats: adminProcedure.query(async ({ ctx }) => {
    const ops = Object.keys(DATASET_FILE_MAP) as AIOperationType[];

    // Load each dataset to count cases (cached per-request in memory here).
    const datasetInfo = await Promise.all(
      ops.map(async (op) => {
        try {
          const dataset = await loadDataset(op);
          return {
            operation: op,
            caseCount: dataset.cases.length,
            unavailableReason: dataset.unavailableReason ?? null,
          };
        } catch (err) {
          return {
            operation: op,
            caseCount: 0,
            unavailableReason: `dataset load failed: ${(err as Error).message}`,
          };
        }
      }),
    );

    // For each op, find the most recent EvalCase status from the latest
    // COMPLETED run — not necessarily the last-run per-op (a run may cover
    // multiple ops), so we just pick the most recent case row per op.
    const lastCases = await ctx.db.$queryRaw<
      Array<{
        operation: AIOperationType;
        status: string;
        createdAt: Date;
      }>
    >`
      SELECT DISTINCT ON ("operation") "operation", "status", "createdAt"
      FROM "EvalCase"
      ORDER BY "operation", "createdAt" DESC
    `;
    const lastByOp = new Map(lastCases.map((c) => [c.operation, c]));

    return datasetInfo.map((info) => {
      const last = lastByOp.get(info.operation);
      return {
        ...info,
        lastCaseStatus: last?.status ?? null,
        lastCaseAt: last?.createdAt ?? null,
      };
    });
  }),
});
