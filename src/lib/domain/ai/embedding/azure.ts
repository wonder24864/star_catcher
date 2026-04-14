/**
 * Azure OpenAI Embedding Provider.
 *
 * Uses the AzureOpenAI SDK for text-embedding-3-small (or configured model).
 * Falls back to AZURE_OPENAI_ENDPOINT/API_KEY if embedding-specific vars are not set.
 */

import { AzureOpenAI } from "openai";
import type { EmbeddingProvider } from "./types";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("embedding-azure");

export class AzureEmbeddingProvider implements EmbeddingProvider {
  readonly provider = "azure";
  readonly model: string;
  readonly dimensions: number;
  private client: AzureOpenAI;
  private deployment: string;

  constructor() {
    const endpoint = process.env.EMBEDDING_ENDPOINT || process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey = process.env.EMBEDDING_API_KEY || process.env.AZURE_OPENAI_API_KEY;
    this.deployment = process.env.EMBEDDING_DEPLOYMENT || "text-embedding-3-small";
    this.model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
    this.dimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || "1536", 10);

    if (!endpoint || !apiKey) {
      throw new Error(
        "Missing embedding config: set EMBEDDING_ENDPOINT/API_KEY or AZURE_OPENAI_ENDPOINT/API_KEY",
      );
    }

    this.client = new AzureOpenAI({
      endpoint,
      apiKey,
      deployment: this.deployment,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
    });

    log.info(
      { model: this.model, dimensions: this.dimensions, deployment: this.deployment },
      "Azure embedding provider initialized",
    );
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      input: text,
      model: this.deployment,
      dimensions: this.dimensions,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Azure OpenAI supports batch embedding natively
    const response = await this.client.embeddings.create({
      input: texts,
      model: this.deployment,
      dimensions: this.dimensions,
    });

    // Sort by index to ensure order matches input
    return response.data
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);
  }
}
