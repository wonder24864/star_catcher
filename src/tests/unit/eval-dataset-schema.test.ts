/**
 * Unit: EvalFramework dataset schema + loader (Sprint 16 US-058).
 *
 * Smoke-loads every dataset file shipped with the repo to make sure
 * golden data remains machine-readable as schemas evolve.
 */
import path from "node:path";
import { describe, test, expect } from "vitest";
import {
  DATASET_FILE_MAP,
  datasetSchema,
  loadDataset,
  loadDatasets,
} from "@/lib/domain/ai/eval/dataset-schema";
import type { AIOperationType } from "@prisma/client";

const DATASET_DIR = path.resolve(process.cwd(), "tests/eval/datasets");

describe("EvalFramework dataset schema", () => {
  test("rejects file with no cases and no unavailableReason", () => {
    expect(() =>
      datasetSchema.parse({
        operation: "DIAGNOSE_ERROR",
        version: "1.0.0",
        cases: [],
      }),
    ).toThrow();
  });

  test("accepts file with empty cases when unavailableReason present", () => {
    const parsed = datasetSchema.parse({
      operation: "WEAKNESS_PROFILE",
      version: "1.0.0",
      cases: [],
      unavailableReason: "see sprint 11 design",
    });
    expect(parsed.unavailableReason).toContain("sprint 11");
  });

  test("accepts well-formed cases", () => {
    const parsed = datasetSchema.parse({
      operation: "SUBJECT_DETECT",
      version: "1.0.0",
      exactMatchFields: ["subject"],
      judgedFields: [],
      cases: [
        {
          id: "sd-01",
          input: { questionContent: "1+1?" },
          expected: { subject: "MATH" },
        },
      ],
    });
    expect(parsed.cases).toHaveLength(1);
  });

  test("rejects case with missing id", () => {
    expect(() =>
      datasetSchema.parse({
        operation: "SUBJECT_DETECT",
        version: "1.0.0",
        cases: [{ id: "", input: {}, expected: {} }],
      }),
    ).toThrow();
  });
});

describe("EvalFramework dataset loader — all 13 shipped datasets", () => {
  const operations = Object.keys(DATASET_FILE_MAP) as AIOperationType[];

  test.each(operations)("loads %s dataset", async (op) => {
    const dataset = await loadDataset(op, DATASET_DIR);
    expect(dataset.operation).toBe(op);
    if (dataset.cases.length === 0) {
      expect(dataset.unavailableReason).toBeTruthy();
    }
  });

  test("loadDatasets loads them all in one pass", async () => {
    const map = await loadDatasets(operations, DATASET_DIR);
    expect(map.size).toBe(operations.length);
  });

  test("dataset file name declared operation matches filename mapping", async () => {
    // mismatch would throw; run all and require success
    for (const op of operations) {
      await expect(loadDataset(op, DATASET_DIR)).resolves.toBeDefined();
    }
  });
});
