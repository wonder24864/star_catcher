/**
 * Unit Tests: SemanticCacheService
 *
 * Tests dual-layer cache: prompt_hash exact match + embedding cosine similarity.
 * Uses mocked Prisma and EmbeddingProvider.
 *
 * See: docs/sprints/sprint-10a.md (Task 94)
 */
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock Prisma
vi.mock("@/lib/infra/db", () => ({
  db: {
    semanticCache: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

import { db } from "@/lib/infra/db";
import { SemanticCacheService } from "@/lib/domain/ai/harness/semantic-cache";
import type { EmbeddingProvider } from "@/lib/domain/ai/embedding/types";

function createMockEmbedding(): EmbeddingProvider {
  return {
    provider: "test",
    model: "test-embed",
    dimensions: 1536,
    embed: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
    embedBatch: vi.fn().mockResolvedValue([new Array(1536).fill(0.1)]),
  };
}

describe("SemanticCacheService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Enable cache via env
    process.env.SEMANTIC_CACHE_ENABLED = "true";
    process.env.SEMANTIC_CACHE_TTL_HOURS = "168";
    process.env.SEMANTIC_CACHE_SIMILARITY_THRESHOLD = "0.95";
  });

  test("isCacheable returns true for HELP_GENERATE", () => {
    const cache = new SemanticCacheService(null);
    expect(cache.isCacheable("HELP_GENERATE")).toBe(true);
    expect(cache.isCacheable("EXTRACT_KNOWLEDGE_POINTS")).toBe(true);
    expect(cache.isCacheable("CLASSIFY_QUESTION_KNOWLEDGE")).toBe(true);
    expect(cache.isCacheable("DIAGNOSE_ERROR")).toBe(true);
  });

  test("isCacheable returns false for non-cacheable operations", () => {
    const cache = new SemanticCacheService(null);
    expect(cache.isCacheable("OCR_RECOGNIZE")).toBe(false);
    expect(cache.isCacheable("SUBJECT_DETECT")).toBe(false);
    expect(cache.isCacheable("GRADE_ANSWER")).toBe(false);
  });

  test("isCacheable returns false when disabled", () => {
    process.env.SEMANTIC_CACHE_ENABLED = "false";
    const cache = new SemanticCacheService(null);
    expect(cache.isCacheable("HELP_GENERATE")).toBe(false);
  });

  test("hashPrompt produces consistent SHA-256", () => {
    const cache = new SemanticCacheService(null);
    const messages = [
      { role: "system", content: "You are a helper" },
      { role: "user", content: "What is 1+1?" },
    ];
    const hash1 = cache.hashPrompt(messages);
    const hash2 = cache.hashPrompt(messages);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex
  });

  test("hashPrompt differs for different messages", () => {
    const cache = new SemanticCacheService(null);
    const hash1 = cache.hashPrompt([{ role: "user", content: "A" }]);
    const hash2 = cache.hashPrompt([{ role: "user", content: "B" }]);
    expect(hash1).not.toBe(hash2);
  });

  test("lookup returns exact hash match (layer 1)", async () => {
    const cache = new SemanticCacheService(null);
    const mockResponse = { helpText: "cached help" };

    vi.mocked(db.semanticCache.findFirst).mockResolvedValue({
      id: "cache-1",
      response: mockResponse,
    } as never);
    vi.mocked(db.semanticCache.update).mockResolvedValue({} as never);

    const result = await cache.lookup("HELP_GENERATE", "abc123", "1.0.0", "test prompt");

    expect(result.hit).toBe(true);
    expect(result.cacheId).toBe("cache-1");
    expect(result.response).toEqual(mockResponse);
  });

  test("lookup falls through to embedding match (layer 2)", async () => {
    const embedding = createMockEmbedding();
    const cache = new SemanticCacheService(embedding);

    // Layer 1 miss
    vi.mocked(db.semanticCache.findFirst).mockResolvedValue(null);
    // Layer 2 hit
    vi.mocked(db.$queryRaw).mockResolvedValue([
      { id: "cache-2", response: { helpText: "semantic hit" }, similarity: 0.97 },
    ]);
    vi.mocked(db.semanticCache.update).mockResolvedValue({} as never);

    const result = await cache.lookup("HELP_GENERATE", "abc123", "1.0.0", "test prompt");

    expect(result.hit).toBe(true);
    expect(result.cacheId).toBe("cache-2");
    expect(embedding.embed).toHaveBeenCalledWith("test prompt");
  });

  test("lookup returns miss when similarity below threshold", async () => {
    const embedding = createMockEmbedding();
    const cache = new SemanticCacheService(embedding);

    vi.mocked(db.semanticCache.findFirst).mockResolvedValue(null);
    vi.mocked(db.$queryRaw).mockResolvedValue([
      { id: "cache-3", response: {}, similarity: 0.90 }, // Below 0.95 threshold
    ]);

    const result = await cache.lookup("HELP_GENERATE", "abc123", "1.0.0", "test");

    expect(result.hit).toBe(false);
  });

  test("lookup returns miss when no results", async () => {
    const embedding = createMockEmbedding();
    const cache = new SemanticCacheService(embedding);

    vi.mocked(db.semanticCache.findFirst).mockResolvedValue(null);
    vi.mocked(db.$queryRaw).mockResolvedValue([]);

    const result = await cache.lookup("HELP_GENERATE", "abc123", "1.0.0", "test");

    expect(result.hit).toBe(false);
  });

  test("lookup gracefully handles errors", async () => {
    const cache = new SemanticCacheService(null);
    vi.mocked(db.semanticCache.findFirst).mockRejectedValue(new Error("DB down"));

    const result = await cache.lookup("HELP_GENERATE", "abc123", "1.0.0", "test");

    expect(result.hit).toBe(false); // Non-fatal
  });

  test("store upserts cache entry", async () => {
    const cache = new SemanticCacheService(null);
    vi.mocked(db.semanticCache.upsert).mockResolvedValue({} as never);

    await cache.store("HELP_GENERATE", "abc123", "1.0.0", "prompt text", { result: "ok" });

    expect(db.semanticCache.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          operationType_promptHash_promptVersion: {
            operationType: "HELP_GENERATE",
            promptHash: "abc123",
            promptVersion: "1.0.0",
          },
        },
      }),
    );
  });

  test("store does nothing when disabled", async () => {
    process.env.SEMANTIC_CACHE_ENABLED = "false";
    const cache = new SemanticCacheService(null);

    await cache.store("HELP_GENERATE", "abc123", "1.0.0", "prompt", { result: "ok" });

    expect(db.semanticCache.upsert).not.toHaveBeenCalled();
  });
});
