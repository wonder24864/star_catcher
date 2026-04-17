/**
 * AdminLog domain helper.
 *
 * Best-effort audit logging for system operations (Brain, MemoryWriteInterceptor)
 * that run outside tRPC context. AdminLog.adminId FK references User.id, so a
 * system user must exist in DB for writes to succeed. If it doesn't, we warn
 * but never crash the caller.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("admin-log");

/**
 * Write an AdminLog entry. For system-triggered operations, pass
 * adminId = "system" (requires a system user in DB).
 *
 * Best-effort: wraps in try/catch, warns on failure, never throws.
 *
 * Sprint 26 D69: returns the created record's id AND createdAt (or null on
 * failure). Callers (e.g. Brain handler publishing SSE events) use the real
 * DB-truth values so that Subscription events and later `listRuns` results
 * agree on both identity and timestamp — avoiding flicker on pagination.
 */
export async function logAdminAction(
  db: PrismaClient,
  adminId: string,
  action: string,
  target: string | null,
  details: Record<string, unknown>,
): Promise<{ id: string; createdAt: Date } | null> {
  try {
    const created = await db.adminLog.create({
      data: {
        adminId,
        action,
        target,
        details: details as Prisma.InputJsonValue,
      },
      select: { id: true, createdAt: true },
    });
    return { id: created.id, createdAt: created.createdAt };
  } catch (err) {
    log.warn({ err, action, target, adminId }, "Failed to write AdminLog entry");
    return null;
  }
}
