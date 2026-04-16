/**
 * Zod schema for EvalFramework dataset files + loader.
 *
 * Datasets live in `tests/eval/datasets/<kebab-operation>.json` and are
 * loaded at runtime by EvalRunner. Loader does validation and throws early
 * (fail loud, not silent) — a broken dataset should not degrade to "all SKIPPED".
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AIOperationType } from "@prisma/client";
import type { EvalDataset } from "./types";

const caseSpecSchema = z.object({
  id: z.string().min(1).max(64),
  input: z.record(z.unknown()),
  expected: z.record(z.unknown()),
  locale: z.string().optional(),
  note: z.string().optional(),
});

/**
 * Dataset file schema. A dataset must either have at least one case OR
 * declare `unavailableReason`. Having neither is a configuration error.
 */
export const datasetSchema = z
  .object({
    operation: z.string().min(1),
    version: z.string().min(1),
    promptVersion: z.string().optional(),
    exactMatchFields: z.array(z.string()).default([]),
    judgedFields: z.array(z.string()).default([]),
    cases: z.array(caseSpecSchema).default([]),
    unavailableReason: z.string().optional(),
  })
  .refine((v) => v.cases.length > 0 || (v.unavailableReason != null && v.unavailableReason.length > 0), {
    message: "Dataset must have at least one case OR an unavailableReason",
  });

/**
 * AIOperationType → dataset file name mapping (kebab-case, deterministic).
 * Kept explicit rather than auto-derived so renames surface as compile errors.
 */
export const DATASET_FILE_MAP: Record<AIOperationType, string> = {
  OCR_RECOGNIZE: "ocr-recognize.json",
  SUBJECT_DETECT: "subject-detect.json",
  HELP_GENERATE: "help-generate.json",
  GRADE_ANSWER: "grade-answer.json",
  EXTRACT_KNOWLEDGE_POINTS: "extract-knowledge-points.json",
  CLASSIFY_QUESTION_KNOWLEDGE: "classify-question-knowledge.json",
  DIAGNOSE_ERROR: "diagnose-error.json",
  WEAKNESS_PROFILE: "weakness-profile.json",
  INTERVENTION_PLAN: "intervention-plan.json",
  MASTERY_EVALUATE: "mastery-evaluate.json",
  FIND_SIMILAR: "find-similar.json",
  GENERATE_EXPLANATION: "generate-explanation.json",
  EVAL_JUDGE: "eval-judge.json",
  LEARNING_SUGGESTION: "learning-suggestion.json",
};

/**
 * Default dataset directory relative to repo root. Overridable for tests.
 */
export function defaultDatasetDir(): string {
  return path.resolve(process.cwd(), "tests/eval/datasets");
}

/**
 * Load one dataset file. Throws on missing or invalid file.
 */
export async function loadDataset(
  operation: AIOperationType,
  dir: string = defaultDatasetDir(),
): Promise<EvalDataset> {
  const file = path.join(dir, DATASET_FILE_MAP[operation]);
  if (!existsSync(file)) {
    throw new Error(`EvalFramework dataset missing: ${file}`);
  }
  const raw = await readFile(file, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`EvalFramework dataset JSON parse failed for ${operation}: ${(err as Error).message}`);
  }
  const validated = datasetSchema.parse(parsed);
  if (validated.operation !== operation) {
    throw new Error(
      `EvalFramework dataset operation mismatch: file ${DATASET_FILE_MAP[operation]} declares ${validated.operation}`,
    );
  }
  return validated as EvalDataset;
}

/**
 * Load datasets for a list of operations. Failures are propagated immediately.
 */
export async function loadDatasets(
  operations: AIOperationType[],
  dir: string = defaultDatasetDir(),
): Promise<Map<AIOperationType, EvalDataset>> {
  const entries = await Promise.all(
    operations.map(async (op) => [op, await loadDataset(op, dir)] as const),
  );
  return new Map(entries);
}
