/**
 * Weakness Profile BullMQ job handler.
 *
 * Two modes:
 *   1. studentId === "__all__" → Fan out: query active students,
 *      enqueue individual weakness-profile jobs.
 *   2. Specific studentId → Aggregate MasteryState data,
 *      compute severity/trend, save WeaknessProfile, write AdminLog.
 *
 * See: docs/sprints/sprint-11.md (Task 102)
 */

import type { Job } from "bullmq";
import type { WeaknessProfileJobData } from "@/lib/infra/queue/types";
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/infra/db";
import { enqueueWeaknessProfile } from "@/lib/infra/queue";
import { StudentMemoryImpl } from "@/lib/domain/memory/student-memory";
import { buildWeaknessProfile } from "@/lib/domain/weakness/compute-profile";
import { computeSemesterStart } from "@/lib/domain/weakness/semester";
import { logAdminAction } from "@/lib/domain/admin-log";
import { createLogger } from "@/lib/infra/logger";
import type { InterventionRecord, WeaknessTier } from "@/lib/domain/memory/types";

const log = createLogger("worker:weakness-profile");

// ─── Active Students Query ──────────────────────

/**
 * Find active students for weakness analysis.
 * Reuses the same logic as learning-brain: non-MASTERED + non-archived.
 */
async function getActiveStudentIds(): Promise<string[]> {
  const masteryStudents = await (db as any).masteryState.findMany({
    where: {
      status: { not: "MASTERED" },
      archived: false,
    },
    select: { studentId: true },
    distinct: ["studentId"],
  });

  const studentIds = new Set<string>();
  for (const row of masteryStudents) studentIds.add(row.studentId);
  return [...studentIds];
}

// ─── Handler ────────────────────────────────────

export async function handleWeaknessProfile(
  job: Job<WeaknessProfileJobData>,
): Promise<void> {
  const { studentId, userId, locale, tier: requestedTier } = job.data;
  const tier: WeaknessTier = requestedTier ?? "PERIODIC";

  const jobLog = log.child({ jobId: job.id, studentId, tier });

  // ── Mode 1: Fan out to individual students ──
  if (studentId === "__all__") {
    const studentIds = await getActiveStudentIds();
    jobLog.info(
      { count: studentIds.length },
      "Weakness-profile fanout: enqueuing individual jobs",
    );

    for (const sid of studentIds) {
      await enqueueWeaknessProfile({
        studentId: sid,
        userId,
        locale,
        tier: requestedTier,
      });
    }
    return;
  }

  // ── Mode 2: Compute profile for one student ──
  const startTime = Date.now();
  const memory = new StudentMemoryImpl(db as unknown as PrismaClient);

  // 1. Read weak points
  const weakPoints = await memory.getWeakPoints(studentId);

  // 2. Read intervention history per KP
  const interventionsByKP = new Map<string, InterventionRecord[]>();
  for (const wp of weakPoints) {
    let history = await memory.getInterventionHistory(
      studentId,
      wp.knowledgePointId,
    );

    // For PERIODIC tier, filter by semester boundary
    if (tier === "PERIODIC") {
      const semesterStart = computeSemesterStart(new Date());
      history = history.filter((h) => h.createdAt >= semesterStart);
    }

    interventionsByKP.set(wp.knowledgePointId, history);
  }

  // 3. Build profile using shared computation
  const profileData = buildWeaknessProfile({ weakPoints, interventionsByKP });

  // 4. Compute validity window
  const validUntil =
    tier === "PERIODIC"
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      : undefined; // GLOBAL has no expiry

  // 5. Save to DB
  const saved = await memory.saveWeaknessProfile(
    studentId,
    tier,
    profileData,
    validUntil,
  );

  const durationMs = Date.now() - startTime;

  // 6. AdminLog
  await logAdminAction(
    db as unknown as PrismaClient,
    userId,
    "weakness-profile",
    studentId,
    {
      studentId,
      tier,
      weakPointCount: profileData.weakPoints.length,
      profileId: saved.id,
      durationMs,
    },
  );

  jobLog.info(
    { profileId: saved.id, weakPointCount: profileData.weakPoints.length, durationMs },
    "Weakness profile generated",
  );
}
