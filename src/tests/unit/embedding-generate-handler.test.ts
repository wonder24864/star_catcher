/**
 * Unit Tests: embedding-generate handler (Sprint 13, Task 116).
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { EmbeddingGenerateJobData } from "@/lib/infra/queue/types";

const mockEmbed = vi.fn();
vi.mock("@/lib/domain/ai/embedding/azure", () => ({
  AzureEmbeddingProvider: vi.fn().mockImplementation(() => ({
    embed: mockEmbed,
    embedBatch: vi.fn(),
  })),
}));

const mockFindUnique = vi.fn();
const mockExecuteRaw = vi.fn();
vi.mock("@/lib/infra/db", () => ({
  db: {
    errorQuestion: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    $executeRaw: (...args: unknown[]) => mockExecuteRaw(...args),
  },
}));

import { handleEmbeddingGenerate } from "@/worker/handlers/embedding-generate";

function makeJob(data: EmbeddingGenerateJobData): Job<EmbeddingGenerateJobData> {
  return { id: "1", data } as unknown as Job<EmbeddingGenerateJobData>;
}

beforeEach(() => {
  mockEmbed.mockReset();
  mockFindUnique.mockReset();
  mockExecuteRaw.mockReset();
});

describe("handleEmbeddingGenerate", () => {
  test("skips when ErrorQuestion not found (no embed call)", async () => {
    mockFindUnique.mockResolvedValue(null);
    await handleEmbeddingGenerate(makeJob({ errorQuestionId: "missing", userId: "u1" }));
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("skips when ErrorQuestion is soft-deleted", async () => {
    mockFindUnique.mockResolvedValue({
      id: "eq-1",
      content: "1+1=?",
      deletedAt: new Date(),
    });
    await handleEmbeddingGenerate(makeJob({ errorQuestionId: "eq-1", userId: "u1" }));
    expect(mockEmbed).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("skips when content is empty", async () => {
    mockFindUnique.mockResolvedValue({ id: "eq-1", content: "  ", deletedAt: null });
    await handleEmbeddingGenerate(makeJob({ errorQuestionId: "eq-1", userId: "u1" }));
    expect(mockEmbed).not.toHaveBeenCalled();
  });

  test("computes embedding and writes vector via raw SQL", async () => {
    mockFindUnique.mockResolvedValue({
      id: "eq-1",
      content: "1+1=?",
      deletedAt: null,
    });
    mockEmbed.mockResolvedValue([0.1, 0.2, 0.3]);
    mockExecuteRaw.mockResolvedValue(1);

    await handleEmbeddingGenerate(makeJob({ errorQuestionId: "eq-1", userId: "u1" }));

    expect(mockEmbed).toHaveBeenCalledWith("1+1=?");
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    // The tagged template parameters are positional: [strings, ...values].
    // Verify that one of the values is the bracketed vector literal.
    const call = mockExecuteRaw.mock.calls[0];
    const values = call.slice(1);
    expect(values).toContain("[0.1,0.2,0.3]");
    expect(values).toContain("eq-1");
  });

  test("truncates content > 6000 chars before embedding", async () => {
    const long = "a".repeat(8000);
    mockFindUnique.mockResolvedValue({ id: "eq-1", content: long, deletedAt: null });
    mockEmbed.mockResolvedValue([0]);
    mockExecuteRaw.mockResolvedValue(1);

    await handleEmbeddingGenerate(makeJob({ errorQuestionId: "eq-1", userId: "u1" }));
    const passed = mockEmbed.mock.calls[0][0] as string;
    expect(passed.length).toBe(6000);
  });
});
