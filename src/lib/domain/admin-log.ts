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
 * Sprint 26 D69: returns the created record id (or null on failure). This lets
 * callers (e.g. Brain handler) use the real id in downstream events so that
 * Subscription events and `listRuns` results dedupe on the same identity.
 */
export async function logAdminAction(
  db: PrismaClient,
  adminId: string,
  action: string,
  target: string | null,
  details: Record<string, unknown>,
): Promise<string | null> {
  try {
    const created = await db.adminLog.create({
      data: {
        adminId,
        action,
        target,
        details: details as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    log.warn({ err, action, target, adminId }, "Failed to write AdminLog entry");
    return null;
  }
}
