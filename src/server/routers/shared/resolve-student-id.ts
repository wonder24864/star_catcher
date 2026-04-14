/**
 * Shared permission helper — resolves target student ID with RBAC checks.
 *
 * - STUDENT: can only access own data (studentId === requesterId)
 * - PARENT: can access children via family relation verification
 * - ADMIN: can access any student (bypass family check)
 *
 * Extracted from mastery / report / agent-trace routers to eliminate
 * duplication. See Sprint 12 (Task 110).
 */
import { TRPCError } from "@trpc/server";
import type { Context } from "../../trpc";

/**
 * Resolve the target student ID.
 * - If no inputStudentId: default to requester.
 * - If same as requester: direct access.
 * - If role is ADMIN: bypass family check.
 * - Otherwise: verify parent-student family relation.
 */
export async function resolveStudentId(
  db: Context["db"],
  requesterId: string,
  role: string,
  inputStudentId?: string,
): Promise<string> {
  const studentId = inputStudentId ?? requesterId;

  if (studentId === requesterId) return studentId;

  // ADMIN can access any student
  if (role === "ADMIN") return studentId;

  // Verify parent-student relation through family
  const parentFamilies = await db.familyMember.findMany({
    where: { userId: requesterId },
    select: { familyId: true },
  });
  const familyIds = parentFamilies.map((f) => f.familyId);
  if (familyIds.length === 0) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  const studentInFamily = await db.familyMember.findFirst({
    where: { userId: studentId, familyId: { in: familyIds } },
  });
  if (!studentInFamily) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }

  return studentId;
}
