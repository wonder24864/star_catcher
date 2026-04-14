-- Enable pgvector extension for semantic cache embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "DailyTaskPackStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "DailyTaskType" AS ENUM ('REVIEW', 'PRACTICE', 'EXPLANATION');

-- CreateEnum
CREATE TYPE "DailyTaskStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "WeaknessTier" AS ENUM ('REALTIME', 'PERIODIC', 'GLOBAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AIOperationType" ADD VALUE 'WEAKNESS_PROFILE';
ALTER TYPE "AIOperationType" ADD VALUE 'INTERVENTION_PLAN';
ALTER TYPE "AIOperationType" ADD VALUE 'MASTERY_EVALUATE';
ALTER TYPE "AIOperationType" ADD VALUE 'FIND_SIMILAR';
ALTER TYPE "AIOperationType" ADD VALUE 'GENERATE_EXPLANATION';
ALTER TYPE "AIOperationType" ADD VALUE 'EVAL_JUDGE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InterventionType" ADD VALUE 'PRACTICE';
ALTER TYPE "InterventionType" ADD VALUE 'BRAIN_DECISION';

-- AlterTable
ALTER TABLE "MasteryState" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ParentStudentConfig" ADD COLUMN     "learningTimeEnd" VARCHAR(5),
ADD COLUMN     "learningTimeStart" VARCHAR(5),
ADD COLUMN     "maxDailyTasks" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "DailyTaskPack" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "DailyTaskPackStatus" NOT NULL DEFAULT 'PENDING',
    "totalTasks" INTEGER NOT NULL DEFAULT 0,
    "completedTasks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "DailyTaskPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTask" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "type" "DailyTaskType" NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "questionId" TEXT,
    "content" JSONB,
    "status" "DailyTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeaknessProfile" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tier" "WeaknessTier" NOT NULL,
    "data" JSONB NOT NULL,
    "generatedAt" TIMESTAMPTZ NOT NULL,
    "validUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeaknessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemanticCache" (
    "id" TEXT NOT NULL,
    "operationType" "AIOperationType" NOT NULL,
    "promptHash" VARCHAR(64) NOT NULL,
    "promptVersion" VARCHAR(16) NOT NULL,
    "embedding" vector(1536),
    "response" JSONB NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SemanticCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyTaskPack_studentId_status_idx" ON "DailyTaskPack"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTaskPack_studentId_date_key" ON "DailyTaskPack"("studentId", "date");

-- CreateIndex
CREATE INDEX "DailyTask_packId_sortOrder_idx" ON "DailyTask"("packId", "sortOrder");

-- CreateIndex
CREATE INDEX "DailyTask_knowledgePointId_idx" ON "DailyTask"("knowledgePointId");

-- CreateIndex
CREATE INDEX "WeaknessProfile_studentId_tier_generatedAt_idx" ON "WeaknessProfile"("studentId", "tier", "generatedAt");

-- CreateIndex
CREATE INDEX "SemanticCache_operationType_promptVersion_expiresAt_idx" ON "SemanticCache"("operationType", "promptVersion", "expiresAt");

-- CreateIndex
CREATE INDEX "SemanticCache_expiresAt_idx" ON "SemanticCache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticCache_operationType_promptHash_promptVersion_key" ON "SemanticCache"("operationType", "promptHash", "promptVersion");

-- CreateIndex
CREATE INDEX "MasteryState_studentId_archived_status_idx" ON "MasteryState"("studentId", "archived", "status");

-- AddForeignKey
ALTER TABLE "DailyTaskPack" ADD CONSTRAINT "DailyTaskPack_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_packId_fkey" FOREIGN KEY ("packId") REFERENCES "DailyTaskPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTask" ADD CONSTRAINT "DailyTask_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ErrorQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeaknessProfile" ADD CONSTRAINT "WeaknessProfile_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
