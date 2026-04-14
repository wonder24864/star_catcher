/**
 * EmbeddingProvider abstraction — independent of AIProvider.
 *
 * Used by SemanticCache for prompt similarity matching.
 * Factory-based: swap provider via EMBEDDING_PROVIDER env var.
 *
 * See: docs/sprints/sprint-10a.md (Task 91a)
 */

export interface EmbeddingProvider {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;

  /** Generate embedding vector for a single text */
  embed(text: string): Promise<number[]>;

  /** Batch embed multiple texts (more efficient than calling embed N times) */
  embedBatch(texts: string[]): Promise<number[][]>;
}
