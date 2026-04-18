-- AlterEnum
ALTER TYPE "TaskType" ADD VALUE 'EXPLANATION';

-- AlterTable
ALTER TABLE "ErrorQuestion" ADD COLUMN     "explanation" JSONB;
