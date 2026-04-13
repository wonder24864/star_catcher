-- CreateEnum
CREATE TYPE "SkillSource" AS ENUM ('BUILTIN', 'CUSTOM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AIOperationType" ADD VALUE 'EXTRACT_KNOWLEDGE_POINTS';
ALTER TYPE "AIOperationType" ADD VALUE 'CLASSIFY_QUESTION_KNOWLEDGE';

-- AlterTable
ALTER TABLE "SkillDefinition" ADD COLUMN     "source" "SkillSource" NOT NULL DEFAULT 'CUSTOM';
