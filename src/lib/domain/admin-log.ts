/**
 * AdminLog domain helper.
 *
 * Best-effort audit logging for system operations (Brain, MemoryWriteInterceptor)
 * that run outside tRPC context. AdminLog.adminId FK references User.id, so a
 * system user must exist in DB for writes to succeed. If it doesn't, we warn
 * but never crash the caller.
 */

import type { PrismaClient } from "@prisma/client";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("admin-log");

/**
 * Write an AdminLog entry. For system-triggered operations, pass
 * adminId = "system" (requires a system user in DB).
 *
 * Best-effort: wraps in try/catch, warns on failure, never throws.
 */
export async function logAdminAction(
  db: PrismaClient,
  adminId: string,
  action: string,
  target: string | null,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await (db as any).adminLog.create({
      data: { adminId, action, target, details },
    });
  } catch (err) {
    log.warn({ err, action, target, adminId }, "Failed to write AdminLog entry");
  }
}
