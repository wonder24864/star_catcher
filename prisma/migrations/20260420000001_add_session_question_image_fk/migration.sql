-- AlterTable
ALTER TABLE "SessionQuestion" ADD COLUMN "homeworkImageId" TEXT;

-- CreateIndex
CREATE INDEX "SessionQuestion_homeworkImageId_idx" ON "SessionQuestion"("homeworkImageId");

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_homeworkImageId_fkey" FOREIGN KEY ("homeworkImageId") REFERENCES "HomeworkImage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: for sessions with exactly one HomeworkImage, link all their
-- SessionQuestions to it. Multi-image legacy sessions stay NULL (UI
-- falls back to first image by sortOrder).
UPDATE "SessionQuestion" sq
SET "homeworkImageId" = hi.id
FROM "HomeworkImage" hi
WHERE hi."homeworkSessionId" = sq."homeworkSessionId"
  AND sq."homeworkImageId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "HomeworkImage" hi2
    WHERE hi2."homeworkSessionId" = sq."homeworkSessionId"
      AND hi2.id <> hi.id
  );
