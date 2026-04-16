/**
 * Shared utility for querying active student IDs.
 *
 * Used by learning-brain, weakness-profile, and learning-suggestion handlers
 * for __all__ fanout mode.
 *
 * "Active" = has non-MASTERED non-archived MasteryState OR has overdue ReviewSchedule.
 */

import { db } from "@/lib/infra/db";

export async function getActiveStudentIds(): Promise<string[]> {
  // Students with non-MASTERED, non-archived mastery states
  const masteryStudents = await (db as any).masteryState.findMany({
    where: {
      status: { not: "MASTERED" },
      archived: false,
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
