-- CreateEnum
CREATE TYPE "SuggestionType" AS ENUM ('WEEKLY_AUTO', 'ON_DEMAND');

-- AlterEnum
ALTER TYPE "AIOperationType" ADD VALUE 'LEARNING_SUGGESTION';

-- AlterTable
ALTER TABLE "InterventionHistory" ADD COLUMN     "preMasteryStatus" "MasteryStatus";

-- CreateTable
CREATE TABLE "MasteryStateHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "fromStatus" "MasteryStatus" NOT NULL,
    "toStatus" "MasteryStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "transitionedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasteryStateHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningSuggestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "SuggestionType" NOT NULL,
    "content" JSONB NOT NULL,
    "weekStart" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasteryStateHistory_studentId_knowledgePointId_transitioned_idx" ON "MasteryStateHistory"("studentId", "knowledgePointId", "transitionedAt");

-- CreateIndex
CREATE INDEX "MasteryStateHistory_studentId_toStatus_transitionedAt_idx" ON "MasteryStateHistory"("studentId", "toStatus", "transitionedAt");

-- CreateIndex
CREATE INDEX "LearningSuggestion_studentId_createdAt_idx" ON "LearningSuggestion"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LearningSuggestion_studentId_weekStart_type_key" ON "LearningSuggestion"("studentId", "weekStart", "type");

-- AddForeignKey
ALTER TABLE "MasteryStateHistory" ADD CONSTRAINT "MasteryStateHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryStateHistory" ADD CONSTRAINT "MasteryStateHistory_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningSuggestion" ADD CONSTRAINT "LearningSuggestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
