import type { AIOperationType } from "@prisma/client";
import type { AIUsage } from "../types";
import { db } from "@/lib/infra/db";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("call-logger");

interface CallLogEntry {
  userId?: string;
  operationType: AIOperationType;
  provider: string;
  model: string;
  correlationId?: string;
  promptVersion?: string;
  usage: AIUsage;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
}

/**
 * Log an AI call to the AICallLog table.
 * Fire-and-forget: errors are caught and logged to console, never thrown.
 */
export async function logAICall(entry: CallLogEntry): Promise<void> {
  try {
    await db.aICallLog.create({
      data: {
        userId: entry.userId,
        operationType: entry.operationType,
        provider: entry.provider,
        model: entry.model,
        correlationId: entry.correlationId,
        promptVersion: entry.promptVersion,
        inputTokens: entry.usage.inputTokens,
        outputTokens: entry.usage.outputTokens,
        durationMs: entry.durationMs,
        success: entry.success,
        errorMessage: entry.errorMessage,
      },
    });
  } catch (e) {
    log.error({ err: e }, "Failed to log AI call");
  }
}
