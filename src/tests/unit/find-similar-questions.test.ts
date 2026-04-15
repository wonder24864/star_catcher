/**
 * Unit Tests: findSimilarQuestions (Sprint 13, Task 115)
 *
 * Verifies the dual-path retrieval logic: KP-dimension first, then pgvector
 * cosine, with KP-priority deduplication and limit clamping.
 */
import { describe, test, expect, vi } from "vitest";
import { findSimilarQuestions } from "@/lib/domain/similar-questions/find";

interface MockRow {
  id: string;
  content: string;
  correctAnswer: string | null;
}

function createMockDb(opts: {
  kpRows?: MockRow[];
  targetEmbedding?: string | null;
  embeddingRows?: Array<MockRow & { similarity: number }>;
}) {
  return {
    errorQuestion: {
      findMany: vi.fn().mockResolvedValue(opts.kpRows ?? []),
    },
    $queryRaw: vi.fn(async () => {
      // First call → target embedding lookup; subsequent → embedding similarity.
      const callIndex = ($queryRawCalls.value += 1);
      if (callIndex === 1) {
        return [
          { embedding_text: opts.targetEmbedding ?? null },
        ];
      }
      return opts.embeddingRows ?? [];
    }),
  };
  // closure-local counter because vi.fn doesn't expose call-index easily
}

const $queryRawCalls = { value: 0 };

describe("findSimilarQuestions", () => {
  test("KP-only path when target has no embedding", async () => {
    $queryRawCalls.value = 0;
    const db = createMockDb({
      kpRows: [
        { id: "q1", content: "qa", correctAnswer: "1" },
        { id: "q2", content: "qb", correctAnswer: "2" },
      ],
      targetEmbedding: null,
    });

    const result = await findSimilarQuestions(db as never, {
      errorQuestionId: "target",
      knowledgePointId: "kp-1",
      limit: 5,
    });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.source === "KP")).toBe(true);
    expect(result.map((r) => r.id)).toEqual(["q1", "q2"]);
  });

  test("merges KP + EMBEDDING paths with KP priority on duplicates", async () => {
    $queryRawCalls.value = 0;
    const db = createMockDb({
      kpRows: [
        { id: "shared-1", content: "from-kp", correctAnswer: null },
        { id: "kp-only", content: "kp-2", correctAnswer: null },
      ],
      targetEmbedding: "[0.1,0.2]",
      embeddingRows: [
        // shared-1 also returned by embedding path → must keep KP version
        { id: "shared-1", content: "from-embed", correctAnswer: null, similarity: 0.99 },
        { id: "embed-only", content: "embed-1", correctAnswer: null, similarity: 0.85 },
      ],
    });

    const result = await findSimilarQuestions(db as never, {
      errorQuestionId: "target",
      knowledgePointId: "kp-1",
      limit: 5,
    });

    const shared = result.find((r) => r.id === "shared-1");
    expect(shared).toBeDefined();
    expect(shared!.source).toBe("KP"); // KP wins for duplicates
    expect(result.find((r) => r.id === "embed-only")?.source).toBe("EMBEDDING");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  test("respects limit when KP path alone exceeds it", async () => {
    $queryRawCalls.value = 0;
    const db = createMockDb({
      kpRows: [
        { id: "a", content: "1", correctAnswer: null },
        { id: "b", content: "2", correctAnswer: null },
        { id: "c", content: "3", correctAnswer: null },
        { id: "d", content: "4", correctAnswer: null },
        { id: "e", content: "5", correctAnswer: null },
      ],
      targetEmbedding: "[0.1]",
      embeddingRows: [{ id: "f", content: "6", correctAnswer: null, similarity: 0.7 }],
    });

    const result = await findSimilarQuestions(db as never, {
      errorQuestionId: "target",
      knowledgePointId: "kp-1",
      limit: 3,
    });

    expect(result).toHaveLength(3);
    // Should be the first 3 KP rows; embedding path should not run since
    // KP already filled the quota (or the embedding rows are ignored on dedupe).
    expect(result.every((r) => r.source === "KP")).toBe(true);
  });

  test("returns empty when limit is 0", async () => {
    $queryRawCalls.value = 0;
    const db = createMockDb({ kpRows: [] });
    const result = await findSimilarQuestions(db as never, {
      errorQuestionId: "target",
      knowledgePointId: "kp-1",
      limit: 0,
    });
    expect(result).toEqual([]);
  });
});
