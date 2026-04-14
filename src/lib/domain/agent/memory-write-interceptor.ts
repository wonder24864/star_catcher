/**
 * Memory Write Interceptor — enforces AgentDefinition.memoryWriteManifest.
 *
 * Wraps the onWriteMemory IPC handler to validate that the method being
 * called is in the agent's declared whitelist. On violation:
 *   1. Logs to AdminLog (action = "memory-write-rejection")
 *   2. Throws FORBIDDEN_MEMORY_WRITE error (Skill execution continues,
 *      but the write is refused)
 *
 * See: docs/adr/008-agent-architecture.md, docs/adr/010-student-memory-layer.md
 */

import type { PrismaClient } from "@prisma/client";
import { logAdminAction } from "@/lib/domain/admin-log";

export interface MemoryWriteInterceptorConfig {
  /** Agent name for logging and error messages */
  agentName: string;
  /** Allowed write method names. undefined = allow all (backward compat). [] = deny all. */
  manifest: string[] | undefined;
  /** Prisma DB for AdminLog writes */
  db: PrismaClient;
  /** User ID for AdminLog entry (typically the userId from job data) */
  userId: string;
}

/**
 * Creates an onWriteMemory handler that validates against memoryWriteManifest.
 *
 * @param config - Interceptor configuration
 * @param innerHandler - The actual write logic, called only if validation passes
 * @returns Wrapped handler with manifest enforcement
 */
export function createMemoryWriteInterceptor(
  config: MemoryWriteInterceptorConfig,
  innerHandler: (method: string, params: Record<string, unknown>) => Promise<void>,
): (method: string, params: Record<string, unknown>) => Promise<void> {
  const { agentName, manifest, db, userId } = config;

  // undefined manifest = allow all (backward compat for agents without manifest)
  if (manifest === undefined) {
    return innerHandler;
  }

  const allowedSet = new Set(manifest);

  return async (method: string, params: Record<string, unknown>) => {
    if (!allowedSet.has(method)) {
      // Log violation (best-effort, never throws — catch any logAdminAction error)
      await logAdminAction(db, userId, "memory-write-rejection", agentName, {
        method,
        agentName,
        studentId: params.studentId,
        reason: `Method "${method}" not in memoryWriteManifest for agent "${agentName}"`,
        allowedMethods: manifest,
      }).catch(() => {});

      throw new Error(
        `FORBIDDEN_MEMORY_WRITE: Agent "${agentName}" is not allowed to call ` +
          `writeMemory("${method}"). Allowed methods: [${manifest.join(", ")}]`,
      );
    }

    await innerHandler(method, params);
  };
}
