/**
 * EmbeddingProvider factory — resolved from EMBEDDING_PROVIDER env var.
 *
 * Lazy singleton: provider is created on first call and reused.
 * Future: add "ollama" case for local model deployment.
 */

import type { EmbeddingProvider } from "./types";
import { AzureEmbeddingProvider } from "./azure";

let instance: EmbeddingProvider | null = null;

export function createEmbeddingProvider(): EmbeddingProvider {
  if (instance) return instance;

  const provider = process.env.EMBEDDING_PROVIDER || "azure";

  switch (provider) {
    case "azure":
      instance = new AzureEmbeddingProvider();
      break;
    // future: case "ollama": instance = new OllamaEmbeddingProvider(); break;
    default:
      throw new Error(`Unknown embedding provider: ${provider}`);
  }

  return instance;
}

/**
 * Reset the singleton — only for testing.
 */
export function resetEmbeddingProvider(): void {
  instance = null;
}
