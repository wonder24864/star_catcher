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
import { runLearningBrain, cooldownKey, COOLDOWN_SECONDS } from "@/lib/domain/brain";
import { logAdminAction } from "@/lib/domain/admin-log";
import { createLogger } from "@/lib/infra/logger";
import type { InterventionPlanningJobData, MasteryEvaluationJobData } from "@/lib/infra/queue/types";

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

// ─── Active Students Query ──────────────────────

/**
 * Find active students for Brain scanning.
 * Active = has non-MASTERED MasteryState OR has overdue ReviewSchedule.
 */
async function getActiveStudentIds(): Promise<string[]> {
  // Students with non-MASTERED mastery states
  const masteryStudents = await (db as any).masteryState.findMany({
    where: {
      status: { not: "MASTERED" },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  // Students with overdue reviews
  const reviewStudents = await (db as any).reviewSchedule.findMany({
    where: {
      nextReviewAt: { lte: new Date() },
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  // Merge and deduplicate
  const studentIds = new Set<string>();
  for (const row of masteryStudents) studentIds.add(row.studentId);
  for (const row of reviewStudents) studentIds.add(row.studentId);

  return [...studentIds];
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
  const { studentId, userId, locale } = job.data;

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
    return;
  }

  const startTime = Date.now();

  try {
    const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

    const decision = await runLearningBrain(
      { studentId, userId, locale },
      { memory, redis },
    );

    const jobIds = await enqueueDecision(decision);

    // Set cooldown key if intervention-planning was enqueued
    const hasIntervention = decision.agentsToLaunch.some(
      (a) => a.jobName === "intervention-planning",
    );
    if (hasIntervention) {
      await redis.set(cooldownKey(studentId), "1", "EX", COOLDOWN_SECONDS);
    }
    const durationMs = Date.now() - startTime;

    // AdminLog: brain-run (Rule 8)
    await logAdminAction(db as unknown as PrismaClient, userId, "brain-run", studentId, {
      studentId,
      eventsProcessed: decision.eventsProcessed,
      agentsLaunched: decision.agentsToLaunch.map((a) => ({
        jobName: a.jobName,
        reason: a.reason,
      })),
      skipped: decision.skipped,
      durationMs,
    });

    jobLog.info(
      {
        eventsProcessed: decision.eventsProcessed,
        agentsLaunched: decision.agentsToLaunch.length,
        skipped: decision.skipped.length,
        durationMs,
      },
      "Brain run completed",
    );
  } finally {
    await releaseLock(studentId);
  }
}
