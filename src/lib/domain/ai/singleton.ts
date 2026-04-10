import type { AIProvider } from "./types";
import { createAIProvider } from "./provider-factory";

const globalForAI = globalThis as unknown as {
  aiProvider: AIProvider | undefined;
};

/**
 * Lazy-initialized global AIProvider singleton.
 * Same pattern as MinIO and Prisma clients.
 */
export function getAIProvider(): AIProvider {
  if (!globalForAI.aiProvider) {
    globalForAI.aiProvider = createAIProvider();
  }
  return globalForAI.aiProvider;
}
