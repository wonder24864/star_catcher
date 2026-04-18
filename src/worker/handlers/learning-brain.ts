/**
 * Learning Brain BullMQ job handler.
 *
 * Two modes:
 *   1. studentId === "__all__" → Fan out: query active students, enqueue
 *      individual learning-brain jobs per student.
 *   2. Specific studentId → Acquire Redis lock, run Brain logic,
 *      enqueue decided Agent jobs, write AdminLog.
 *
 * See: docs/adr/011-learning-closed-loop.md (D11-D13)
 * See: CLAUDE.md Rule 8 (Brain discipline)
 */

import type { Job } from "bullmq";
import type { LearningBrainJobData } from "@/lib/infra/queue/types";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/infra/db";
import { redis } from "@/lib/infra/redis";
import { enqueueLearningBrain, enqueueInterventionPlanning, enqueueMasteryEvaluation } from "@/lib/infra/queue";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import {
  runLearningBrain,
  cooldownKey,
  getCooldownTTL,
  MAX_COOLDOWN_TIER,
  parseCooldownValue,
} from "@/lib/domain/brain";
import { logAdminAction } from "@/lib/domain/admin-log";
import { createLogger } from "@/lib/infra/logger";
import { publishBrainRun } from "@/lib/infra/events";
import {
  updateTaskStep,
  completeTask,
  failTask,
} from "@/lib/task-runner";
import type { InterventionPlanningJobData, MasteryEvaluationJobData } from "@/lib/infra/queue/types";
import { getActiveStudentIds } from "./shared-active-students";

const log = createLogger("worker:learning-brain");

// ─── Redis Lock ─────────────────────────────────

const LOCK_TTL_SECONDS = 300; // 5 minutes (D13)

function lockKey(studentId: string): string {
  return `learning-brain:lock:${studentId}`;
}

async function acquireLock(studentId: string): Promise<boolean> {
  const result = await redis.set(lockKey(studentId), "1", "EX", LOCK_TTL_SECONDS, "NX");
  return result === "OK";
}

async function releaseLock(studentId: string): Promise<void> {
  await redis.del(lockKey(studentId));
}

// ─── Enqueue Helpers ────────────────────────────

async function enqueueDecision(
  decision: Awaited<ReturnType<typeof runLearningBrain>>,
): Promise<string[]> {
  const jobIds: string[] = [];

  for (const agent of decision.agentsToLaunch) {
    let jobId: string;
    if (agent.jobName === "intervention-planning") {
      jobId = await enqueueInterventionPlanning(
        agent.data as unknown as InterventionPlanningJobData,
      );
    } else {
      jobId = await enqueueMasteryEvaluation(
        agent.data as unknown as MasteryEvaluationJobData,
      );
    }
    jobIds.push(jobId);
  }

  return jobIds;
}

// ─── Handler ────────────────────────────────────

export async function handleLearningBrain(
  job: Job<LearningBrainJobData>,
): Promise<void> {
  const { studentId, userId, locale, taskId } = job.data;

  const jobLog = log.child({ jobId: job.id, studentId });

  // ── Mode 1: Fan out to individual students ──
  if (studentId === "__all__") {
    const studentIds = await getActiveStudentIds();
    jobLog.info({ count: studentIds.length }, "Brain fanout: enqueuing individual jobs");

    for (const sid of studentIds) {
      await enqueueLearningBrain({ studentId: sid, userId, locale });
    }
    return;
  }

  // ── Mode 2: Run Brain for one student ──
  const locked = await acquireLock(studentId);
  if (!locked) {
    jobLog.info("Brain already running for student, skipping");
    if (taskId) {
      await completeTask(taskId, {
        resultRef: {
          route: `/admin/brain`,
          payload: { skipped: true, reason: "already-running" },
        },
      });
    }
    return;
  }

  const startTime = Date.now();

  try {
    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.brain.collecting",
        progress: 20,
      });
    }

    const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

    const decision = await runLearningBrain(
      { studentId, userId, locale },
      { memory, redis },
    );

    if (taskId) {
      await updateTaskStep(taskId, {
        step: "task.step.brain.launchingAgents",
        progress: 65,
      });
    }

    const jobIds = await enqueueDecision(decision);

    // Set progressive cooldown if intervention-planning was enqueued (D55)
    const hasIntervention = decision.agentsToLaunch.some(
      (a) => a.jobName === "intervention-planning",
    );
    if (hasIntervention) {
      // Read existing cooldown to determine next tier
      const existing = parseCooldownValue(
        await redis.get(cooldownKey(studentId)),
      );
      const nextTier = Math.min(
        (existing?.tier ?? 0) + 1,
        MAX_COOLDOWN_TIER,
      );
      const ttl = getCooldownTTL(nextTier);
      const value = JSON.stringify({ tier: nextTier, setAt: new Date().toISOString() });
      await redis.set(cooldownKey(studentId), value, "EX", ttl);
    }
    const durationMs = Date.now() - startTime;

    // AdminLog: brain-run (Rule 8). Sprint 26 D69: capture { id, createdAt }
    // so the SSE event carries DB-truth identity + timestamp.
    const agentsLaunched = decision.agentsToLaunch.map((a) => ({
      jobName: a.jobName,
      reason: a.reason,
    }));
    const created = await logAdminAction(
      db as unknown as PrismaClient,
      userId,
      "brain-run",
      studentId,
      {
        studentId,
        eventsProcessed: decision.eventsProcessed,
        agentsLaunched,
        skipped: decision.skipped,
        durationMs,
      },
    );

    // Sprint 26 D62/D64: publish to global brain:runs channel so the admin
    // Brain monitor can prepend without refetching. Failure is non-fatal —
    // surface the real error via logger.warn (Rule 7), not silent catch.
    if (created) {
      const student = await db.user.findUnique({
        where: { id: studentId },
        select: { nickname: true },
      });
      try {
        await publishBrainRun({
          logId: created.id,
          studentId,
          studentNickname: student?.nickname ?? null,
          eventsProcessed: decision.eventsProcessed,
          agentsLaunched,
          skipped: decision.skipped,
          durationMs,
          createdAt: created.createdAt.toISOString(),
        });
      } catch (err) {
        jobLog.warn({ err, logId: created.id }, "Failed to publish brain-run event");
      }
    }

    jobLog.info(
      {
        eventsProcessed: decision.eventsProcessed,
        agentsLaunched: decision.agentsToLaunch.length,
        skipped: decision.skipped.length,
        durationMs,
      },
      "Brain run completed",
    );

    if (taskId) {
      await completeTask(taskId, {
        resultRef: {
          route: `/admin/brain`,
          payload: {
            agentsLaunched: decision.agentsToLaunch.length,
            skipped: decision.skipped.length,
            durationMs,
          },
        },
      });
    }
  } catch (err) {
    if (taskId) {
      await failTask(taskId, {
        errorCode: "BRAIN_CRASHED",
        errorMessage: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
    throw err;
  } finally {
    await releaseLock(studentId);
  }
}
