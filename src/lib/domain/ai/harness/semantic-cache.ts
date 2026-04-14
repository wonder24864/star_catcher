/**
 * SemanticCacheService — dual-layer AI response cache.
 *
 * Layer 1: prompt_hash exact match (zero cost)
 * Layer 2: embedding cosine similarity (pgvector, ≥ threshold)
 *
 * Cache entries include promptVersion — schema upgrades auto-invalidate.
 *
 * See: docs/sprints/sprint-10a.md (Task 91c)
 */

import { createHash } from "crypto";
import type { AIOperationType } from "@prisma/client";
import type { EmbeddingProvider } from "../embedding/types";
import { db } from "@/lib/infra/db";
import { createLogger } from "@/lib/infra/logger";

const log = createLogger("semantic-cache");

/** Operations that benefit from semantic caching */
const CACHEABLE_OPERATIONS: Set<string> = new Set([
  "HELP_GENERATE",
  "EXTRACT_KNOWLEDGE_POINTS",
  "CLASSIFY_QUESTION_KNOWLEDGE",
  "DIAGNOSE_ERROR",
]);

export interface CacheLookupResult {
  hit: boolean;
  cacheId?: string;
  response?: unknown; // Parsed JSON response
}

export class SemanticCacheService {
  private readonly enabled: boolean;
  private readonly ttlHours: number;
  private readonly similarityThreshold: number;

  constructor(private readonly embeddingProvider: EmbeddingProvider | null) {
    this.enabled = process.env.SEMANTIC_CACHE_ENABLED === "true";
    this.ttlHours = parseInt(process.env.SEMANTIC_CACHE_TTL_HOURS || "168", 10);
    this.similarityThreshold = parseFloat(
      process.env.SEMANTIC_CACHE_SIMILARITY_THRESHOLD || "0.95",
    );
  }

  /** Check if an operation type is cacheable */
  isCacheable(operationType: string): boolean {
    return this.enabled && CACHEABLE_OPERATIONS.has(operationType);
  }

  /** Compute SHA-256 hash of normalized prompt text */
  hashPrompt(messages: Array<{ role: string; content: string | unknown[] }>): string {
    const normalized = messages
      .map((m) => `${m.role}:${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
      .join("\n");
    return createHash("sha256").update(normalized).digest("hex");
  }

  /**
   * Look up a cached response. Two layers:
   * 1. Exact prompt_hash match (fast, free)
   * 2. Embedding cosine similarity (pgvector query)
   */
  async lookup(
    operationType: AIOperationType,
    promptHash: string,
    promptVersion: string,
    promptText: string,
  ): Promise<CacheLookupResult> {
    if (!this.enabled) return { hit: false };

    try {
      // Layer 1: exact hash match
      const exact = await db.semanticCache.findFirst({
        where: {
          operationType,
          promptHash,
          promptVersion,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, response: true },
      });

      if (exact) {
        // Increment hit count (fire-and-forget)
        db.semanticCache
          .update({ where: { id: exact.id }, data: { hitCount: { increment: 1 } } })
          .catch((e) => log.warn({ err: e }, "Failed to increment cache hit count"));

        log.debug({ operationType, layer: "exact" }, "Semantic cache hit (exact)");
        return { hit: true, cacheId: exact.id, response: exact.response };
      }

      // Layer 2: embedding cosine similarity
      if (!this.embeddingProvider) return { hit: false };

      const embedding = await this.embeddingProvider.embed(promptText);
      const vectorStr = `[${embedding.join(",")}]`;

      // Use raw SQL for pgvector cosine distance operator
      const similar = await db.$queryRaw<
        Array<{ id: string; response: unknown; similarity: number }>
      >`
        SELECT id, response, 1 - (embedding <=> ${vectorStr}::vector) as similarity
        FROM "SemanticCache"
        WHERE "operationType" = ${operationType}::"AIOperationType"
          AND "promptVersion" = ${promptVersion}
          AND "expiresAt" > NOW()
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT 1
      `;

      if (similar.length > 0 && similar[0].similarity >= this.similarityThreshold) {
        // Increment hit count
        db.semanticCache
          .update({ where: { id: similar[0].id }, data: { hitCount: { increment: 1 } } })
          .catch((e) => log.warn({ err: e }, "Failed to increment cache hit count"));

        log.debug(
          { operationType, layer: "semantic", similarity: similar[0].similarity },
          "Semantic cache hit (cosine)",
        );
        return { hit: true, cacheId: similar[0].id, response: similar[0].response };
      }

      return { hit: false };
    } catch (e) {
      // Cache lookup failure is non-fatal
      log.warn({ err: e, operationType }, "Semantic cache lookup failed, continuing");
      return { hit: false };
    }
  }

  /**
   * Store a validated response in the cache.
   * Upsert on (operationType, promptHash, promptVersion).
   */
  async store(
    operationType: AIOperationType,
    promptHash: string,
    promptVersion: string,
    promptText: string,
    response: unknown,
  ): Promise<void> {
    if (!this.enabled) return;

    try {
      const expiresAt = new Date(Date.now() + this.ttlHours * 3600 * 1000);

      // Upsert the cache entry (without embedding first)
      await db.semanticCache.upsert({
        where: {
          operationType_promptHash_promptVersion: {
            operationType,
            promptHash,
            promptVersion,
          },
        },
        create: {
          operationType,
          promptHash,
          promptVersion,
          response: response as object,
          expiresAt,
        },
        update: {
          response: response as object,
          expiresAt,
          hitCount: 0,
        },
      });

      // Generate and store embedding asynchronously
      if (this.embeddingProvider) {
        this.storeEmbedding(operationType, promptHash, promptVersion, promptText).catch((e) =>
          log.warn({ err: e }, "Failed to store cache embedding"),
        );
      }
    } catch (e) {
      // Cache store failure is non-fatal
      log.warn({ err: e, operationType }, "Semantic cache store failed");
    }
  }

  private async storeEmbedding(
    operationType: AIOperationType,
    promptHash: string,
    promptVersion: string,
    promptText: string,
  ): Promise<void> {
    const embedding = await this.embeddingProvider!.embed(promptText);
    const vectorStr = `[${embedding.join(",")}]`;

    await db.$executeRaw`
      UPDATE "SemanticCache"
      SET embedding = ${vectorStr}::vector
      WHERE "operationType" = ${operationType}::"AIOperationType"
        AND "promptHash" = ${promptHash}
        AND "promptVersion" = ${promptVersion}
    `;
  }
}
