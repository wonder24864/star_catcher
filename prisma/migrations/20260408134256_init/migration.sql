-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'PARENT', 'ADMIN');

-- CreateEnum
CREATE TYPE "Grade" AS ENUM ('PRIMARY_1', 'PRIMARY_2', 'PRIMARY_3', 'PRIMARY_4', 'PRIMARY_5', 'PRIMARY_6', 'JUNIOR_1', 'JUNIOR_2', 'JUNIOR_3', 'SENIOR_1', 'SENIOR_2', 'SENIOR_3');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('zh', 'en');

-- CreateEnum
CREATE TYPE "FamilyMemberRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "Subject" AS ENUM ('MATH', 'CHINESE', 'ENGLISH', 'PHYSICS', 'CHEMISTRY', 'BIOLOGY', 'POLITICS', 'HISTORY', 'GEOGRAPHY', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('EXAM', 'HOMEWORK', 'DICTATION', 'COPYWRITING', 'ORAL_CALC', 'COMPOSITION', 'OTHER');

-- CreateEnum
CREATE TYPE "HomeworkStatus" AS ENUM ('CREATED', 'RECOGNIZING', 'RECOGNIZED', 'RECOGNITION_FAILED', 'CHECKING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('CHOICE', 'FILL_BLANK', 'TRUE_FALSE', 'SHORT_ANSWER', 'CALCULATION', 'ESSAY', 'DICTATION_ITEM', 'COPY_ITEM', 'OTHER');

-- CreateEnum
CREATE TYPE "AIOperationType" AS ENUM ('OCR_RECOGNIZE', 'SUBJECT_DETECT', 'HELP_GENERATE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(32) NOT NULL,
    "password" VARCHAR(128) NOT NULL,
    "nickname" VARCHAR(32) NOT NULL,
    "role" "UserRole" NOT NULL,
    "grade" "Grade",
    "locale" "Locale" NOT NULL DEFAULT 'zh',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ,
    "loginFailCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Family" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(32) NOT NULL,
    "inviteCode" VARCHAR(8),
    "inviteCodeExpiresAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Family_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FamilyMember" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "role" "FamilyMemberRole" NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FamilyMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkSession" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "subject" "Subject",
    "contentType" "ContentType",
    "grade" "Grade",
    "title" VARCHAR(128),
    "status" "HomeworkStatus" NOT NULL DEFAULT 'CREATED',
    "finalScore" DOUBLE PRECISION,
    "totalRounds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "HomeworkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomeworkImage" (
    "id" TEXT NOT NULL,
    "homeworkSessionId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "originalFilename" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "exifRotation" INTEGER NOT NULL DEFAULT 0,
    "privacyStripped" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomeworkImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionQuestion" (
    "id" TEXT NOT NULL,
    "homeworkSessionId" TEXT NOT NULL,
    "questionNumber" INTEGER NOT NULL,
    "questionType" "QuestionType",
    "content" TEXT NOT NULL,
    "studentAnswer" TEXT,
    "correctAnswer" TEXT,
    "isCorrect" BOOLEAN,
    "confidence" DOUBLE PRECISION,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "imageRegion" JSONB,
    "aiKnowledgePoint" VARCHAR(256),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "SessionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckRound" (
    "id" TEXT NOT NULL,
    "homeworkSessionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "score" DOUBLE PRECISION,
    "totalQuestions" INTEGER,
    "correctCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundQuestionResult" (
    "id" TEXT NOT NULL,
    "checkRoundId" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "studentAnswer" TEXT,
    "isCorrect" BOOLEAN NOT NULL,
    "correctedFromPrev" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoundQuestionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpRequest" (
    "id" TEXT NOT NULL,
    "homeworkSessionId" TEXT NOT NULL,
    "sessionQuestionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "aiResponse" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ErrorQuestion" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "sessionQuestionId" TEXT,
    "subject" "Subject" NOT NULL,
    "contentType" "ContentType",
    "grade" "Grade",
    "questionType" "QuestionType",
    "content" TEXT NOT NULL,
    "contentHash" VARCHAR(64),
    "studentAnswer" TEXT,
    "correctAnswer" TEXT,
    "errorAnalysis" TEXT,
    "aiKnowledgePoint" VARCHAR(256),
    "imageUrl" TEXT,
    "totalAttempts" INTEGER NOT NULL DEFAULT 1,
    "correctAttempts" INTEGER NOT NULL DEFAULT 0,
    "isMastered" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ErrorQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentNote" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "errorQuestionId" TEXT NOT NULL,
    "content" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ParentNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentStudentConfig" (
    "id" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "maxHelpLevel" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentStudentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICallLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "operationType" "AIOperationType" NOT NULL,
    "provider" VARCHAR(16) NOT NULL,
    "model" VARCHAR(32) NOT NULL,
    "correlationId" VARCHAR(64),
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Family_inviteCode_key" ON "Family"("inviteCode");

-- CreateIndex
CREATE INDEX "Family_inviteCode_idx" ON "Family"("inviteCode");

-- CreateIndex
CREATE INDEX "FamilyMember_familyId_idx" ON "FamilyMember"("familyId");

-- CreateIndex
CREATE INDEX "FamilyMember_userId_idx" ON "FamilyMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FamilyMember_userId_familyId_key" ON "FamilyMember"("userId", "familyId");

-- CreateIndex
CREATE INDEX "HomeworkSession_studentId_createdAt_idx" ON "HomeworkSession"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "HomeworkSession_studentId_status_idx" ON "HomeworkSession"("studentId", "status");

-- CreateIndex
CREATE INDEX "HomeworkSession_status_createdAt_idx" ON "HomeworkSession"("status", "createdAt");

-- CreateIndex
CREATE INDEX "HomeworkImage_homeworkSessionId_idx" ON "HomeworkImage"("homeworkSessionId");

-- CreateIndex
CREATE INDEX "SessionQuestion_homeworkSessionId_idx" ON "SessionQuestion"("homeworkSessionId");

-- CreateIndex
CREATE INDEX "CheckRound_homeworkSessionId_idx" ON "CheckRound"("homeworkSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckRound_homeworkSessionId_roundNumber_key" ON "CheckRound"("homeworkSessionId", "roundNumber");

-- CreateIndex
CREATE INDEX "RoundQuestionResult_checkRoundId_idx" ON "RoundQuestionResult"("checkRoundId");

-- CreateIndex
CREATE INDEX "RoundQuestionResult_sessionQuestionId_idx" ON "RoundQuestionResult"("sessionQuestionId");

-- CreateIndex
CREATE INDEX "HelpRequest_homeworkSessionId_idx" ON "HelpRequest"("homeworkSessionId");

-- CreateIndex
CREATE INDEX "HelpRequest_sessionQuestionId_idx" ON "HelpRequest"("sessionQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorQuestion_sessionQuestionId_key" ON "ErrorQuestion"("sessionQuestionId");

-- CreateIndex
CREATE INDEX "ErrorQuestion_studentId_subject_idx" ON "ErrorQuestion"("studentId", "subject");

-- CreateIndex
CREATE INDEX "ErrorQuestion_studentId_createdAt_idx" ON "ErrorQuestion"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "ErrorQuestion_studentId_isMastered_idx" ON "ErrorQuestion"("studentId", "isMastered");

-- CreateIndex
CREATE INDEX "ErrorQuestion_studentId_deletedAt_createdAt_idx" ON "ErrorQuestion"("studentId", "deletedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ErrorQuestion_studentId_contentHash_key" ON "ErrorQuestion"("studentId", "contentHash");

-- CreateIndex
CREATE INDEX "ParentNote_errorQuestionId_idx" ON "ParentNote"("errorQuestionId");

-- CreateIndex
CREATE INDEX "ParentStudentConfig_parentId_idx" ON "ParentStudentConfig"("parentId");

-- CreateIndex
CREATE INDEX "ParentStudentConfig_studentId_idx" ON "ParentStudentConfig"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentStudentConfig_parentId_studentId_key" ON "ParentStudentConfig"("parentId", "studentId");

-- CreateIndex
CREATE INDEX "AdminLog_adminId_createdAt_idx" ON "AdminLog"("adminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "SystemConfig_key_idx" ON "SystemConfig"("key");

-- CreateIndex
CREATE INDEX "AICallLog_createdAt_idx" ON "AICallLog"("createdAt");

-- CreateIndex
CREATE INDEX "AICallLog_operationType_idx" ON "AICallLog"("operationType");

-- CreateIndex
CREATE INDEX "AICallLog_userId_createdAt_idx" ON "AICallLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FamilyMember" ADD CONSTRAINT "FamilyMember_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkSession" ADD CONSTRAINT "HomeworkSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HomeworkImage" ADD CONSTRAINT "HomeworkImage_homeworkSessionId_fkey" FOREIGN KEY ("homeworkSessionId") REFERENCES "HomeworkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionQuestion" ADD CONSTRAINT "SessionQuestion_homeworkSessionId_fkey" FOREIGN KEY ("homeworkSessionId") REFERENCES "HomeworkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckRound" ADD CONSTRAINT "CheckRound_homeworkSessionId_fkey" FOREIGN KEY ("homeworkSessionId") REFERENCES "HomeworkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundQuestionResult" ADD CONSTRAINT "RoundQuestionResult_checkRoundId_fkey" FOREIGN KEY ("checkRoundId") REFERENCES "CheckRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundQuestionResult" ADD CONSTRAINT "RoundQuestionResult_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "SessionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_homeworkSessionId_fkey" FOREIGN KEY ("homeworkSessionId") REFERENCES "HomeworkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpRequest" ADD CONSTRAINT "HelpRequest_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "SessionQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorQuestion" ADD CONSTRAINT "ErrorQuestion_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ErrorQuestion" ADD CONSTRAINT "ErrorQuestion_sessionQuestionId_fkey" FOREIGN KEY ("sessionQuestionId") REFERENCES "SessionQuestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNote" ADD CONSTRAINT "ParentNote_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentNote" ADD CONSTRAINT "ParentNote_errorQuestionId_fkey" FOREIGN KEY ("errorQuestionId") REFERENCES "ErrorQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentConfig" ADD CONSTRAINT "ParentStudentConfig_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentStudentConfig" ADD CONSTRAINT "ParentStudentConfig_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminLog" ADD CONSTRAINT "AdminLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
