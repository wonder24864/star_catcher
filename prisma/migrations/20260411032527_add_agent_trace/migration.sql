-- CreateEnum
CREATE TYPE "AgentTraceStatus" AS ENUM ('RUNNING', 'COMPLETED', 'TERMINATED', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentTraceTerminationReason" AS ENUM ('COMPLETED', 'MAX_STEPS', 'MAX_TOKENS', 'SKILL_ALL_FAILED', 'ERROR');

-- CreateEnum
CREATE TYPE "AgentTraceStepStatus" AS ENUM ('SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateTable
CREATE TABLE "AgentTrace" (
    "id" TEXT NOT NULL,
    "agentName" VARCHAR(64) NOT NULL,
    "sessionId" VARCHAR(64) NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AgentTraceStatus" NOT NULL DEFAULT 'RUNNING',
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalDurationMs" INTEGER NOT NULL DEFAULT 0,
    "terminationReason" "AgentTraceTerminationReason",
    "summary" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "AgentTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTraceStep" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "stepNo" INTEGER NOT NULL,
    "skillName" VARCHAR(64) NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" "AgentTraceStepStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentTraceStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentTrace_userId_createdAt_idx" ON "AgentTrace"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTrace_sessionId_idx" ON "AgentTrace"("sessionId");

-- CreateIndex
CREATE INDEX "AgentTrace_agentName_createdAt_idx" ON "AgentTrace"("agentName", "createdAt");

-- CreateIndex
CREATE INDEX "AgentTrace_status_idx" ON "AgentTrace"("status");

-- CreateIndex (also covers traceId-only lookups via B-tree left prefix)
CREATE INDEX "AgentTraceStep_traceId_stepNo_idx" ON "AgentTraceStep"("traceId", "stepNo");

-- AddForeignKey
ALTER TABLE "AgentTrace" ADD CONSTRAINT "AgentTrace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTraceStep" ADD CONSTRAINT "AgentTraceStep_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "AgentTrace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
