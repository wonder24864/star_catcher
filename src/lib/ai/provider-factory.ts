import type { AIProvider } from "./types";
import { AzureOpenAIProvider } from "./providers/azure-openai";

/**
 * Create an AIProvider based on the AI_PROVIDER environment variable.
 * Currently supports: "azure" (default).
 * Future: "local" for Ollama/vLLM.
 */
export function createAIProvider(): AIProvider {
  const providerType = process.env.AI_PROVIDER || "azure";

  switch (providerType) {
    case "azure":
      return new AzureOpenAIProvider();
    default:
      throw new Error(`Unknown AI provider: ${providerType}. Supported: azure`);
  }
}
