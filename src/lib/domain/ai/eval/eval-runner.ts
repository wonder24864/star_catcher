/**
 * EvalRunner — Sprint 16 US-058 core pipeline.
 *
 * Given a list of AIOperationType values, for each operation:
 *   1. Load its golden dataset.
 *   2. If dataset has unavailableReason → write one SKIPPED EvalCase and move on.
 *   3. For each case, call the operation through callAIOperation (typed adapter).
 *   4. Compare exactMatchFields deep-equal → on any miss, FAIL (short-circuit).
 *   5. For each judgedField, call EVAL_JUDGE AI op → score >= 3 = PASS.
 *   6. Persist EvalRun + EvalCase rows.
 *
 * Deliberate isolation: EvalRunner accepts deps (db, callAI, callEvalJudge,
 * datasets) so BullMQ handler / unit tests can inject fakes without hitting
 * real Prisma or LLM.
 *
 * See docs/user-stories/admin-phase3.md US-058 for spec.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { AIOperationType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { AICallContext, AIHarnessResult } from "../harness/types";
import type { EvalJudgeOutput } from "../harness/schemas/eval-judge";
import type {
  EvalCaseResult,
  EvalCaseStatus,
  EvalDataset,
  EvalRunResult,
} from "./types";
import { deepEquals, getByPath } from "./compare";
import { loadDatasets } from "./dataset-schema";

/**
 * Minimal Prisma surface EvalRunner needs. Typed structurally so it accepts
 * both vanilla PrismaClient and `$extends`-augmented clients (e.g. soft-delete
 * middleware) without coupling to the exact client shape.
 */
export interface EvalDb {
  evalCase: {
    createMany: (args: {
      data: Prisma.EvalCaseCreateManyInput[];
    }) => Promise<{ count: number }>;
  };
  evalRun: {
    update: (args: {
      where: { id: string };
      data: Prisma.EvalRunUpdateInput;
    }) => Promise<unknown>;
  };
}

export interface EvalRunnerDeps {
  db: EvalDb;
  callAIOperation: (
    operation: string,
    data: Record<string, unknown>,
    context: AICallContext,
  ) => Promise<AIHarnessResult<unknown>>;
  /**
   * Dataset loader. Injected so tests can supply in-memory datasets without
   * touching the filesystem.
   */
  loadDatasets?: (ops: AIOperationType[]) => Promise<Map<AIOperationType, EvalDataset>>;
  /** Clock override for testable timestamps. */
  now?: () => Date;
}

export interface EvalRunnerInput {
  runId: string; // caller pre-creates EvalRun row, passes id
  adminId: string;
  operations: AIOperationType[];
  locale: string;
}

/**
 * Run evaluation for one EvalRun row. The row is expected to already exist
 * with status=RUNNING (handler responsibility). EvalRunner updates totals +
 * status at the end and writes EvalCase rows.
 */
export async function runEval(
  input: EvalRunnerInput,
  deps: EvalRunnerDeps,
): Promise<EvalRunResult> {
  const { runId, adminId, operations, locale } = input;
  const load = deps.loadDatasets ?? loadDatasets;
  const now = deps.now ?? (() => new Date());

  const datasets = await load(operations);
  const caseResults: EvalCaseResult[] = [];

  for (const op of operations) {
    const dataset = datasets.get(op);
    if (!dataset) {
      // Loader missing — treat as SKIPPED with explicit reason.
      caseResults.push({
        operation: op,
        caseId: "_no_dataset",
        status: "SKIPPED",
        input: {},
        expected: {},
        failureReason: "dataset not loaded",
        durationMs: 0,
      });
      continue;
    }

    if (dataset.unavailableReason) {
      caseResults.push({
        operation: op,
        caseId: "_unavailable",
        status: "SKIPPED",
        input: {},
        expected: {},
        failureReason: dataset.unavailableReason,
        durationMs: 0,
      });
      continue;
    }

    for (const spec of dataset.cases) {
      const startedAt = Date.now();
      const ctx: AICallContext = {
        userId: adminId,
        correlationId: `eval:${runId}:${op}:${spec.id}`,
        locale: spec.locale ?? locale,
      };

      let harnessResult: AIHarnessResult<unknown>;
      try {
        // Preprocess fixture-file references → base64 data URIs (OCR images).
        // Dataset JSON stays readable ("imageFiles": ["math-g2-01.jpg"]); runtime
        // converts to imageUrls with data:image/jpeg;base64,... that Vision API
        // accepts directly — no MinIO/presigned-URL machinery needed for eval.
        // Wrapped inside try so a missing fixture becomes a per-case ERROR, not
        // an uncaught exception that kills the whole run.
        const processedInput = preprocessOcrFixtures(op, spec.input);
        harnessResult = await deps.callAIOperation(op, processedInput, ctx);
      } catch (err) {
        caseResults.push({
          operation: op,
          caseId: spec.id,
          status: "ERROR",
          input: spec.input,
          expected: spec.expected,
          failureReason: `exception: ${(err as Error).message}`,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      if (!harnessResult.success || harnessResult.data == null) {
        caseResults.push({
          operation: op,
          caseId: spec.id,
          status: "ERROR",
          input: spec.input,
          expected: spec.expected,
          failureReason:
            harnessResult.error?.message ?? "harness returned no data",
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      const actual = harnessResult.data as Record<string, unknown>;

      // 1) exact-match fields (short-circuit on first mismatch)
      let exactFail: string | null = null;
      for (const field of dataset.exactMatchFields) {
        const ev = getByPath(spec.expected, field);
        const av = getByPath(actual, field);
        if (!deepEquals(ev, av)) {
          exactFail = `exact-match mismatch: ${field} (expected=${JSON.stringify(
            ev,
          )}, actual=${JSON.stringify(av)})`;
          break;
        }
      }
      if (exactFail) {
        caseResults.push({
          operation: op,
          caseId: spec.id,
          status: "FAIL",
          input: spec.input,
          expected: spec.expected,
          actual,
          failureReason: exactFail,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      // 2) judged free-text fields — one judge call per case summarizing all judgedFields.
      //    Zero judgedFields means "exact-match only"; already PASS here.
      if (dataset.judgedFields.length === 0) {
        caseResults.push({
          operation: op,
          caseId: spec.id,
          status: "PASS",
          input: spec.input,
          expected: spec.expected,
          actual,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      // Build a slim expected/actual pair containing only the judged fields.
      const judgedExpected: Record<string, unknown> = {};
      const judgedActual: Record<string, unknown> = {};
      for (const field of dataset.judgedFields) {
        judgedExpected[field] = getByPath(spec.expected, field);
        judgedActual[field] = getByPath(actual, field);
      }

      let verdictResult: AIHarnessResult<unknown>;
      try {
        verdictResult = await deps.callAIOperation(
          "EVAL_JUDGE",
          {
            operation: op,
            operationDescription: describeOperation(op),
            expected: judgedExpected,
            actual: judgedActual,
            locale: spec.locale ?? locale,
          },
          ctx,
        );
      } catch (err) {
        caseResults.push({
          operation: op,
          caseId: spec.id,
          status: "ERROR",
          input: spec.input,
          expected: spec.expected,
          actual,
          failureReason: `eval-judge exception: ${(err as Error).message}`,
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      if (!verdictResult.success || verdictResult.data == null) {
        caseResults.push({
          operation: op,
          caseId: spec.id,
          status: "ERROR",
          input: spec.input,
          expected: spec.expected,
          actual,
          failureReason:
            verdictResult.error?.message ?? "eval-judge returned no data",
          durationMs: Date.now() - startedAt,
        });
        continue;
      }

      const verdict = verdictResult.data as EvalJudgeOutput;
      const status: EvalCaseStatus = verdict.passed ? "PASS" : "FAIL";
      caseResults.push({
        operation: op,
        caseId: spec.id,
        status,
        input: spec.input,
        expected: spec.expected,
        actual,
        judgeScore: verdict.score,
        judgeReasoning: verdict.reasoning,
        failureReason: verdict.passed
          ? undefined
          : `judge score ${verdict.score} < 3`,
        durationMs: Date.now() - startedAt,
      });
    }
  }

  // Aggregate
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((c) => c.status === "PASS").length;
  const failedCases = caseResults.filter((c) => c.status === "FAIL").length;
  const erroredCases = caseResults.filter((c) => c.status === "ERROR").length;
  const skippedCases = caseResults.filter((c) => c.status === "SKIPPED").length;
  const evaluable = totalCases - skippedCases;
  const passRate = evaluable === 0 ? null : passedCases / evaluable;

  // Persist cases. Prisma requires Prisma.JsonNull for nullable Json columns.
  await deps.db.evalCase.createMany({
    data: caseResults.map((c) => ({
      runId,
      operation: c.operation,
      caseId: c.caseId,
      status: c.status,
      input: c.input as Prisma.InputJsonValue,
      expected: c.expected as Prisma.InputJsonValue,
      actual: c.actual === undefined ? Prisma.JsonNull : (c.actual as Prisma.InputJsonValue),
      judgeScore: c.judgeScore ?? null,
      judgeReasoning: c.judgeReasoning ?? null,
      failureReason: c.failureReason ?? null,
      durationMs: c.durationMs,
    })),
  });

  // Finalize run summary
  await deps.db.evalRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      completedAt: now(),
      totalCases,
      passedCases,
      failedCases,
      erroredCases,
      skippedCases,
      passRate,
    },
  });

  return {
    runId,
    status: "COMPLETED",
    operations,
    totalCases,
    passedCases,
    failedCases,
    erroredCases,
    skippedCases,
    passRate,
    cases: caseResults,
  };
}

/**
 * OCR_RECOGNIZE only: if the dataset input has `imageFiles: string[]`
 * (filenames under tests/eval/fixtures/ocr/), replace with `imageUrls: string[]`
 * of base64 data URIs that the Vision API accepts directly.
 *
 * Other operations pass through unchanged.
 */
const OCR_FIXTURES_DIR = path.resolve(process.cwd(), "tests/eval/fixtures/ocr");
const EXT_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function preprocessOcrFixtures(
  op: AIOperationType,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (op !== "OCR_RECOGNIZE") return input;
  const files = input.imageFiles as string[] | undefined;
  if (!files || files.length === 0) return input;

  // Dataset must pick one contract: imageFiles (local fixture) OR imageUrls
  // (pre-resolved). Mixing both is ambiguous and almost certainly a mistake.
  if (Array.isArray(input.imageUrls) && (input.imageUrls as unknown[]).length > 0) {
    throw new Error(
      "OCR dataset case has both imageFiles and imageUrls; choose one (imageFiles for fixtures, imageUrls for pre-resolved URLs)",
    );
  }

  const imageUrls: string[] = [];
  for (const file of files) {
    const abs = path.join(OCR_FIXTURES_DIR, file);
    if (!existsSync(abs)) {
      throw new Error(
        `OCR fixture not found: ${abs} (referenced from dataset imageFiles)`,
      );
    }
    const ext = path.extname(file).toLowerCase();
    const mime = EXT_MIME[ext] ?? "image/jpeg";
    const b64 = readFileSync(abs).toString("base64");
    imageUrls.push(`data:${mime};base64,${b64}`);
  }

  // Return a NEW object; do not mutate the dataset's input (tests rely on it).
  const { imageFiles: _omit, ...rest } = input;
  void _omit;
  return { ...rest, imageUrls };
}

/**
 * Human-readable operation description for the EVAL_JUDGE prompt.
 * Keeps the prompt grounded without the judge needing to hit the KG.
 */
function describeOperation(op: AIOperationType): string {
  const map: Record<AIOperationType, string> = {
    OCR_RECOGNIZE: "Recognize handwritten/printed homework from an image: extract question text and student's answer.",
    SUBJECT_DETECT: "Classify the academic subject of a question (math/chinese/english/etc.).",
    HELP_GENERATE: "Generate a progressive hint at a given help level (1-3) without revealing the answer.",
    GRADE_ANSWER: "Grade a student's answer as correct/incorrect with brief feedback (never reveal the answer).",
    EXTRACT_KNOWLEDGE_POINTS: "Parse a textbook table of contents into a structured knowledge-point tree.",
    CLASSIFY_QUESTION_KNOWLEDGE: "Classify a question to the most relevant knowledge point from candidates.",
    DIAGNOSE_ERROR: "Diagnose the error pattern behind a wrong answer and identify weak knowledge points.",
    WEAKNESS_PROFILE: "Aggregate weak knowledge points over a period/global horizon.",
    INTERVENTION_PLAN: "Plan a daily intervention task list targeting weak knowledge points.",
    MASTERY_EVALUATE: "Evaluate mastery of a knowledge point and suggest a MasteryState transition + SM-2 adjustment.",
    FIND_SIMILAR: "(non-AI deterministic retrieval)",
    GENERATE_EXPLANATION: "Generate an explanation card (static/interactive/conversational) for a knowledge point.",
    EVAL_JUDGE: "(self)",
    LEARNING_SUGGESTION: "Generate personalized learning suggestions for a student based on weakness data, mastery states, and intervention history.",
  };
  return map[op];
}
