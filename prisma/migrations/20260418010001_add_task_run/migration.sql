-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('OCR', 'CORRECTION', 'HELP', 'SUGGESTION', 'EVAL', 'BRAIN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "TaskRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT,
    "type" "TaskType" NOT NULL,
    "key" TEXT NOT NULL,
    "bullJobId" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'QUEUED',
    "step" TEXT,
    "progress" INTEGER,
    "resultRef" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "TaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskRun_userId_status_idx" ON "TaskRun"("userId", "status");

-- CreateIndex
CREATE INDEX "TaskRun_userId_createdAt_idx" ON "TaskRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskRun_key_idx" ON "TaskRun"("key");
