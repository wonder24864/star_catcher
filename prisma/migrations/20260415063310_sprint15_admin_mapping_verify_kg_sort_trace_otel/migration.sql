-- AlterTable
ALTER TABLE "AgentTrace" ADD COLUMN     "otelTraceId" VARCHAR(32);

-- AlterTable
ALTER TABLE "InterventionHistory" ADD COLUMN     "foundationalWeakness" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "KnowledgePoint" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Backfill sortOrder: 按现有 createdAt 给同父兄弟节点分配 0..N
UPDATE "KnowledgePoint"
SET "sortOrder" = sub.rn - 1
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "parentId" ORDER BY "createdAt") AS rn
  FROM "KnowledgePoint"
  WHERE "deletedAt" IS NULL
) sub
WHERE "KnowledgePoint".id = sub.id;

-- AlterTable
ALTER TABLE "QuestionKnowledgeMapping" ADD COLUMN     "verifiedAt" TIMESTAMPTZ,
ADD COLUMN     "verifiedBy" TEXT;

-- CreateIndex
CREATE INDEX "AgentTrace_otelTraceId_idx" ON "AgentTrace"("otelTraceId");

-- CreateIndex
CREATE INDEX "KnowledgePoint_parentId_sortOrder_idx" ON "KnowledgePoint"("parentId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuestionKnowledgeMapping_verifiedAt_confidence_idx" ON "QuestionKnowledgeMapping"("verifiedAt", "confidence");

-- AddForeignKey
ALTER TABLE "QuestionKnowledgeMapping" ADD CONSTRAINT "QuestionKnowledgeMapping_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
