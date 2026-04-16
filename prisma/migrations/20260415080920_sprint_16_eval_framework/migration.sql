-- CreateEnum
CREATE TYPE "EvalRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "EvalCaseStatus" AS ENUM ('PASS', 'FAIL', 'ERROR', 'SKIPPED');

-- CreateTable
CREATE TABLE "EvalRun" (
    "id" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "operations" TEXT[],
    "status" "EvalRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,
    "totalCases" INTEGER NOT NULL DEFAULT 0,
    "passedCases" INTEGER NOT NULL DEFAULT 0,
    "failedCases" INTEGER NOT NULL DEFAULT 0,
    "erroredCases" INTEGER NOT NULL DEFAULT 0,
    "skippedCases" INTEGER NOT NULL DEFAULT 0,
    "passRate" DOUBLE PRECISION,
    "note" TEXT,

    CONSTRAINT "EvalRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvalCase" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "operation" "AIOperationType" NOT NULL,
    "caseId" VARCHAR(64) NOT NULL,
    "status" "EvalCaseStatus" NOT NULL,
    "input" JSONB NOT NULL,
    "expected" JSONB NOT NULL,
    "actual" JSONB,
    "judgeScore" DOUBLE PRECISION,
    "judgeReasoning" TEXT,
    "failureReason" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvalCase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvalRun_startedAt_idx" ON "EvalRun"("startedAt");

-- CreateIndex
CREATE INDEX "EvalRun_triggeredBy_startedAt_idx" ON "EvalRun"("triggeredBy", "startedAt");

-- CreateIndex
CREATE INDEX "EvalRun_status_startedAt_idx" ON "EvalRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "EvalCase_runId_status_idx" ON "EvalCase"("runId", "status");

-- CreateIndex
CREATE INDEX "EvalCase_operation_status_idx" ON "EvalCase"("operation", "status");

-- CreateIndex
CREATE INDEX "EvalCase_runId_operation_idx" ON "EvalCase"("runId", "operation");

-- AddForeignKey
ALTER TABLE "EvalRun" ADD CONSTRAINT "EvalRun_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvalCase" ADD CONSTRAINT "EvalCase_runId_fkey" FOREIGN KEY ("runId") REFERENCES "EvalRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
