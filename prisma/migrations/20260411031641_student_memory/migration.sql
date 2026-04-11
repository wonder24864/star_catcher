-- CreateEnum
CREATE TYPE "MasteryStatus" AS ENUM ('NEW_ERROR', 'CORRECTED', 'REVIEWING', 'MASTERED', 'REGRESSED');

-- CreateEnum
CREATE TYPE "InterventionType" AS ENUM ('DIAGNOSIS', 'HINT', 'REVIEW', 'EXPLANATION');

-- CreateTable
CREATE TABLE "MasteryState" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "status" "MasteryStatus" NOT NULL DEFAULT 'NEW_ERROR',
    "totalAttempts" INTEGER NOT NULL DEFAULT 1,
    "correctAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMPTZ,
    "masteredAt" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MasteryState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewSchedule" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "nextReviewAt" TIMESTAMPTZ NOT NULL,
    "intervalDays" INTEGER NOT NULL DEFAULT 1,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ReviewSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterventionHistory" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "type" "InterventionType" NOT NULL,
    "content" JSONB,
    "agentId" VARCHAR(64),
    "skillId" VARCHAR(64),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterventionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MasteryState_studentId_status_idx" ON "MasteryState"("studentId", "status");

-- CreateIndex
CREATE INDEX "MasteryState_knowledgePointId_idx" ON "MasteryState"("knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "MasteryState_studentId_knowledgePointId_key" ON "MasteryState"("studentId", "knowledgePointId");

-- CreateIndex
CREATE INDEX "ReviewSchedule_studentId_nextReviewAt_idx" ON "ReviewSchedule"("studentId", "nextReviewAt");

-- CreateIndex
CREATE INDEX "ReviewSchedule_knowledgePointId_idx" ON "ReviewSchedule"("knowledgePointId");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewSchedule_studentId_knowledgePointId_key" ON "ReviewSchedule"("studentId", "knowledgePointId");

-- CreateIndex
CREATE INDEX "InterventionHistory_studentId_knowledgePointId_createdAt_idx" ON "InterventionHistory"("studentId", "knowledgePointId", "createdAt");

-- CreateIndex
CREATE INDEX "InterventionHistory_studentId_type_idx" ON "InterventionHistory"("studentId", "type");

-- AddForeignKey
ALTER TABLE "MasteryState" ADD CONSTRAINT "MasteryState_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MasteryState" ADD CONSTRAINT "MasteryState_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewSchedule" ADD CONSTRAINT "ReviewSchedule_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionHistory" ADD CONSTRAINT "InterventionHistory_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterventionHistory" ADD CONSTRAINT "InterventionHistory_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
