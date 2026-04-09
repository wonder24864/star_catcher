-- AlterEnum: Add GRADE_ANSWER to AIOperationType
-- In PostgreSQL, adding a new value to an existing enum type is safe and
-- does not require rebuilding tables.

ALTER TYPE "AIOperationType" ADD VALUE 'GRADE_ANSWER';
