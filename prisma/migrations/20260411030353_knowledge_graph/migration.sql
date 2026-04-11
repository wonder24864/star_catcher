-- CreateEnum
CREATE TYPE "SkillStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "SchoolLevel" AS ENUM ('PRIMARY', 'JUNIOR', 'SENIOR');

-- CreateEnum
CREATE TYPE "KnowledgeRelationType" AS ENUM ('PREREQUISITE', 'PARALLEL', 'CONTAINS');

-- CreateEnum
CREATE TYPE "KnowledgeMappingSource" AS ENUM ('AI_DETECTED', 'ADMIN_VERIFIED');

-- CreateTable
CREATE TABLE "SkillDefinition" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "author" VARCHAR(100) NOT NULL,
    "functionSchema" JSONB NOT NULL,
    "bundleUrl" VARCHAR(512),
    "config" JSONB,
    "status" "SkillStatus" NOT NULL DEFAULT 'DRAFT',
    "callCount" INTEGER NOT NULL DEFAULT 0,
    "avgDurationMs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SkillDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePoint" (
    "id" TEXT NOT NULL,
    "externalId" VARCHAR(128),
    "subject" "Subject" NOT NULL,
    "grade" "Grade",
    "schoolLevel" "SchoolLevel" NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "difficulty" SMALLINT NOT NULL DEFAULT 3,
    "importance" SMALLINT NOT NULL DEFAULT 3,
    "examFrequency" SMALLINT NOT NULL DEFAULT 3,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "KnowledgePoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeRelation" (
    "id" TEXT NOT NULL,
    "fromPointId" TEXT NOT NULL,
    "toPointId" TEXT NOT NULL,
    "type" "KnowledgeRelationType" NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeRelation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionKnowledgeMapping" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "mappingSource" "KnowledgeMappingSource" NOT NULL DEFAULT 'AI_DETECTED',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionKnowledgeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillDefinition_status_idx" ON "SkillDefinition"("status");

-- CreateIndex
CREATE INDEX "SkillDefinition_name_idx" ON "SkillDefinition"("name");

-- CreateIndex
CREATE INDEX "SkillDefinition_deletedAt_status_idx" ON "SkillDefinition"("deletedAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SkillDefinition_name_version_key" ON "SkillDefinition"("name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePoint_externalId_key" ON "KnowledgePoint"("externalId");

-- CreateIndex
CREATE INDEX "KnowledgePoint_subject_schoolLevel_idx" ON "KnowledgePoint"("subject", "schoolLevel");

-- CreateIndex
CREATE INDEX "KnowledgePoint_parentId_idx" ON "KnowledgePoint"("parentId");

-- CreateIndex
CREATE INDEX "KnowledgePoint_deletedAt_subject_idx" ON "KnowledgePoint"("deletedAt", "subject");

-- CreateIndex
CREATE INDEX "KnowledgeRelation_fromPointId_type_idx" ON "KnowledgeRelation"("fromPointId", "type");

-- CreateIndex
CREATE INDEX "KnowledgeRelation_toPointId_type_idx" ON "KnowledgeRelation"("toPointId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeRelation_fromPointId_toPointId_type_key" ON "KnowledgeRelation"("fromPointId", "toPointId", "type");

-- CreateIndex
CREATE INDEX "QuestionKnowledgeMapping_knowledgePointId_idx" ON "QuestionKnowledgeMapping"("knowledgePointId");

-- CreateIndex
CREATE INDEX "QuestionKnowledgeMapping_questionId_idx" ON "QuestionKnowledgeMapping"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionKnowledgeMapping_questionId_knowledgePointId_key" ON "QuestionKnowledgeMapping"("questionId", "knowledgePointId");

-- AddForeignKey
ALTER TABLE "KnowledgePoint" ADD CONSTRAINT "KnowledgePoint_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "KnowledgePoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_fromPointId_fkey" FOREIGN KEY ("fromPointId") REFERENCES "KnowledgePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeRelation" ADD CONSTRAINT "KnowledgeRelation_toPointId_fkey" FOREIGN KEY ("toPointId") REFERENCES "KnowledgePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionKnowledgeMapping" ADD CONSTRAINT "QuestionKnowledgeMapping_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ErrorQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionKnowledgeMapping" ADD CONSTRAINT "QuestionKnowledgeMapping_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
