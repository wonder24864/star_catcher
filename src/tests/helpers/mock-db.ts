/**
 * In-memory mock of Prisma client for unit testing tRPC routers.
 * Stores data in arrays, supports basic CRUD operations.
 */
import type { Context } from "@/server/trpc";

type MockUser = {
  id: string;
  username: string;
  password: string;
  nickname: string;
  role: string;
  grade: string | null;
  locale: string;
  isActive: boolean;
  deletedAt: null;
  loginFailCount: number;
  lockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockFamily = {
  id: string;
  name: string;
  inviteCode: string | null;
  inviteCodeExpiresAt: Date | null;
  deletedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

type MockFamilyMember = {
  id: string;
  userId: string;
  familyId: string;
  role: string;
  joinedAt: Date;
};

type MockHomeworkSession = {
  id: string;
  studentId: string;
  createdBy: string;
  subject: string | null;
  contentType: string | null;
  grade: string | null;
  title: string | null;
  status: string;
  finalScore: number | null;
  totalRounds: number;
  createdAt: Date;
  updatedAt: Date;
};

type MockSessionQuestion = {
  id: string;
  homeworkSessionId: string;
  questionNumber: number;
  questionType: string | null;
  content: string;
  studentAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean | null;
  confidence: number | null;
  needsReview: boolean;
  imageRegion: unknown;
  aiKnowledgePoint: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockHomeworkImage = {
  id: string;
  homeworkSessionId: string;
  imageUrl: string;
  originalFilename: string | null;
  sortOrder: number;
  exifRotation: number;
  privacyStripped: boolean;
  createdAt: Date;
};

type MockCheckRound = {
  id: string;
  homeworkSessionId: string;
  roundNumber: number;
  score: number | null;
  totalQuestions: number | null;
  correctCount: number | null;
  createdAt: Date;
};

type MockRoundQuestionResult = {
  id: string;
  checkRoundId: string;
  sessionQuestionId: string;
  studentAnswer: string | null;
  isCorrect: boolean;
  correctedFromPrev: boolean;
};

type MockHelpRequest = {
  id: string;
  homeworkSessionId: string;
  sessionQuestionId: string;
  level: number;
  aiResponse: string;
  createdAt: Date;
};

type MockErrorQuestion = {
  id: string;
  studentId: string;
  sessionQuestionId: string | null;
  subject: string;
  contentType: string | null;
  grade: string | null;
  questionType: string | null;
  content: string;
  contentHash: string | null;
  studentAnswer: string | null;
  correctAnswer: string | null;
  errorAnalysis: string | null;
  aiKnowledgePoint: string | null;
  imageUrl: string | null;
  totalAttempts: number;
  correctAttempts: number;
  isMastered: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockParentStudentConfig = {
  id: string;
  parentId: string;
  studentId: string;
  maxHelpLevel: number;
  maxDailyTasks: number;
  learningTimeStart: string | null;
  learningTimeEnd: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MockAdminLog = {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  details: unknown;
  createdAt: Date;
};

type MockParentNote = {
  id: string;
  parentId: string;
  errorQuestionId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

let counter = 0;
function cuid() {
  return `test_${++counter}_${Date.now()}`;
}

export function createMockDb() {
  const users: MockUser[] = [];
  const families: MockFamily[] = [];
  const familyMembers: MockFamilyMember[] = [];
  const homeworkSessions: MockHomeworkSession[] = [];
  const homeworkImages: MockHomeworkImage[] = [];
  const sessionQuestions: MockSessionQuestion[] = [];
  const checkRounds: MockCheckRound[] = [];
  const roundQuestionResults: MockRoundQuestionResult[] = [];
  const helpRequests: MockHelpRequest[] = [];
  const parentStudentConfigs: MockParentStudentConfig[] = [];
  const errorQuestions: MockErrorQuestion[] = [];
  const parentNotes: MockParentNote[] = [];
  const adminLogs: MockAdminLog[] = [];
  const learningSuggestions: any[] = [];
  const interventionHistories: any[] = [];
  const masteryStates: any[] = [];
  const taskRuns: any[] = [];
  let taskRunSeq = 0;

  return {
    user: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return users.find((u) => {
          if (where.username && u.username !== where.username) return false;
          if (where.id && u.id !== where.id) return false;
          if (where.isActive !== undefined && u.isActive !== where.isActive) return false;
          if (u.deletedAt !== null) return false;
          return true;
        }) || null;
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        return users.find((u) => u.id === where.id) || null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const user: MockUser = {
          id: cuid(),
          username: data.username as string,
          password: data.password as string,
          nickname: data.nickname as string,
          role: data.role as string,
          grade: (data.grade as string) || null,
          locale: (data.locale as string) || "zh",
          isActive: true,
          deletedAt: null,
          loginFailCount: 0,
          lockedUntil: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        users.push(user);
        return user;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const user = users.find((u) => u.id === where.id);
        if (user) Object.assign(user, data, { updatedAt: new Date() });
        return user;
      },
    },
    family: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        return families.find((f) => {
          if (where.inviteCode && f.inviteCode !== where.inviteCode) return false;
          if (where.id && f.id !== where.id) return false;
          if (f.deletedAt !== null) return false;
          return true;
        }) || null;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const family: MockFamily = {
          id: cuid(),
          name: data.name as string,
          inviteCode: (data.inviteCode as string) || null,
          inviteCodeExpiresAt: (data.inviteCodeExpiresAt as Date) || null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        families.push(family);
        // Handle nested members create
        if (data.members && typeof data.members === "object") {
          const membersData = data.members as { create?: Record<string, unknown> };
          if (membersData.create) {
            const member: MockFamilyMember = {
              id: cuid(),
              userId: membersData.create.userId as string,
              familyId: family.id,
              role: membersData.create.role as string,
              joinedAt: new Date(),
            };
            familyMembers.push(member);
          }
        }
        return family;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const family = families.find((f) => f.id === where.id);
        if (family) Object.assign(family, data, { updatedAt: new Date() });
        return family;
      },
    },
    familyMember: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.userId_familyId) {
          const { userId, familyId } = where.userId_familyId as { userId: string; familyId: string };
          return familyMembers.find((m) => m.userId === userId && m.familyId === familyId) || null;
        }
        return null;
      },
      findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
        return familyMembers.find((m) => {
          if (where?.userId && m.userId !== where.userId) return false;
          if (where?.familyId) {
            const fid = where.familyId;
            if (typeof fid === "object" && fid !== null && "in" in fid) {
              if (!(fid as { in: string[] }).in.includes(m.familyId)) return false;
            } else {
              if (m.familyId !== fid) return false;
            }
          }
          return true;
        }) || null;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where, include }: { where?: Record<string, unknown>; include?: any }) => {
        let result = familyMembers;
        if (where?.userId) result = result.filter((m) => m.userId === where.userId);
        if (where?.familyId) {
          const fid = where.familyId;
          if (typeof fid === "object" && fid !== null && "in" in fid) {
            result = result.filter((m) => (fid as { in: string[] }).in.includes(m.familyId));
          } else {
            result = result.filter((m) => m.familyId === fid);
          }
        }
        // Handle user role filter
        if (where?.user && typeof where.user === "object" && "role" in (where.user as Record<string, unknown>)) {
          const roleFilter = (where.user as { role: string }).role;
          result = result.filter((m) => {
            const user = users.find((u) => u.id === m.userId);
            return user?.role === roleFilter;
          });
        }
        // Handle includes
        if (include?.family) {
          return result.map((m) => ({
            ...m,
            family: {
              ...families.find((f) => f.id === m.familyId),
              members: include.family?.include?.members
                ? familyMembers
                    .filter((fm) => fm.familyId === m.familyId)
                    .map((fm) => ({
                      ...fm,
                      user: users.find((u) => u.id === fm.userId),
                    }))
                : undefined,
            },
          }));
        }
        if (include?.user) {
          return result.map((m) => ({
            ...m,
            user: users.find((u) => u.id === m.userId),
          }));
        }
        return result;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const member: MockFamilyMember = {
          id: cuid(),
          userId: data.userId as string,
          familyId: data.familyId as string,
          role: data.role as string,
          joinedAt: new Date(),
        };
        familyMembers.push(member);
        return member;
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        if (where.userId_familyId) {
          const { userId, familyId } = where.userId_familyId as { userId: string; familyId: string };
          const idx = familyMembers.findIndex((m) => m.userId === userId && m.familyId === familyId);
          if (idx >= 0) familyMembers.splice(idx, 1);
        }
        return {};
      },
    },
    homeworkSession: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: any }) => {
        const session = homeworkSessions.find((s) => s.id === where.id) || null;
        if (!session) return null;
        let result: Record<string, unknown> = { ...session };
        if (include?.images) {
          result.images = homeworkImages
            .filter((i) => i.homeworkSessionId === session.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        }
        if (include?.questions) {
          result.questions = sessionQuestions
            .filter((q) => q.homeworkSessionId === session.id)
            .sort((a, b) => a.questionNumber - b.questionNumber);
        }
        if (include?.checkRounds) {
          const includeRounds = include.checkRounds as {
            orderBy?: { roundNumber?: string };
            include?: { results?: boolean };
          };
          let rounds = checkRounds.filter((r) => r.homeworkSessionId === session.id);
          if (includeRounds.orderBy?.roundNumber === "asc") {
            rounds = rounds.slice().sort((a, b) => a.roundNumber - b.roundNumber);
          }
          result.checkRounds = includeRounds.include?.results
            ? rounds.map((r) => ({
                ...r,
                results: roundQuestionResults.filter((rr) => rr.checkRoundId === r.id),
              }))
            : rounds;
        }
        if (include?.helpRequests) {
          let hrs = helpRequests.filter((h) => h.homeworkSessionId === session.id);
          if (include.helpRequests.orderBy?.level === "asc") {
            hrs = hrs.slice().sort((a, b) => a.level - b.level);
          }
          result.helpRequests = hrs;
        }
        return result;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where, orderBy, take, include }: { where?: Record<string, unknown>; orderBy?: any; take?: number; include?: any }) => {
        let result = [...homeworkSessions];
        if (where?.studentId) {
          const sid = where.studentId;
          if (typeof sid === "object" && sid !== null && "in" in sid) {
            result = result.filter((s) => (sid as { in: string[] }).in.includes(s.studentId));
          } else {
            result = result.filter((s) => s.studentId === sid);
          }
        }
        if (where?.status) result = result.filter((s) => s.status === where.status);
        // Date range filter
        if (where?.createdAt && typeof where.createdAt === "object") {
          const df = where.createdAt as { gte?: Date; lte?: Date; lt?: Date };
          if (df.gte) result = result.filter((s) => s.createdAt >= df.gte!);
          if (df.lte) result = result.filter((s) => s.createdAt <= df.lte!);
          if (df.lt) result = result.filter((s) => s.createdAt < df.lt!);
        }
        if (orderBy?.createdAt === "desc") result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        else if (orderBy?.createdAt === "asc") result.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        if (take) result = result.slice(0, take);
        if (!include) return result;
        return result.map((s) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const extra: Record<string, any> = {};
          if (include._count?.select?.images) {
            extra._count = { images: homeworkImages.filter((i) => i.homeworkSessionId === s.id).length };
          }
          if (include.helpRequests !== undefined) {
            const hrs = helpRequests.filter((h) => h.homeworkSessionId === s.id);
            extra.helpRequests = include.helpRequests?.select?.level
              ? hrs.map((h) => ({ level: h.level }))
              : hrs;
          }
          if (include.checkRounds !== undefined) {
            let rounds = checkRounds.filter((r) => r.homeworkSessionId === s.id);
            if (include.checkRounds?.orderBy?.roundNumber === "asc") {
              rounds = rounds.slice().sort((a, b) => a.roundNumber - b.roundNumber);
            }
            extra.checkRounds = include.checkRounds?.select
              ? rounds.map((r) => ({ roundNumber: r.roundNumber, score: r.score }))
              : rounds;
          }
          if (include.images) {
            extra.images = homeworkImages
              .filter((i) => i.homeworkSessionId === s.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
          }
          return { ...s, ...extra };
        });
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const session: MockHomeworkSession = {
          id: cuid(),
          studentId: data.studentId as string,
          createdBy: data.createdBy as string,
          subject: (data.subject as string) || null,
          contentType: (data.contentType as string) || null,
          grade: (data.grade as string) || null,
          title: (data.title as string) || null,
          status: (data.status as string) || "CREATED",
          finalScore: null,
          totalRounds: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        homeworkSessions.push(session);
        return session;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const session = homeworkSessions.find((s) => s.id === where.id);
        if (session) Object.assign(session, data, { updatedAt: new Date() });
        return session || null;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        let count = 0;
        for (const s of homeworkSessions) {
          let matches = true;
          if (where.id && s.id !== where.id) matches = false;
          // Sprint 17: finalizeCheck / confirmResults use
          // `updateMany where: { id, status: "RECOGNIZED" }` as a
          // compare-and-swap to prevent double-transition races. Mirror that
          // semantic here so the mock's count reflects the real race guard.
          if (where.status !== undefined && s.status !== where.status) matches = false;
          if (where.updatedAt !== undefined) {
            const whereTime =
              where.updatedAt instanceof Date
                ? where.updatedAt.getTime()
                : new Date(where.updatedAt as string).getTime();
            if (s.updatedAt.getTime() !== whereTime) matches = false;
          }
          if (matches) {
            Object.assign(s, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUniqueOrThrow: async ({ where }: { where: Record<string, unknown>; include?: any }) => {
        const session = homeworkSessions.find((s) => s.id === where.id);
        if (!session) {
          throw new Error(`HomeworkSession not found: ${String(where.id)}`);
        }
        return session;
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        const idx = homeworkSessions.findIndex((s) => s.id === where.id);
        if (idx >= 0) {
          const deleted = homeworkSessions.splice(idx, 1);
          // Cascade: remove associated images
          for (let i = homeworkImages.length - 1; i >= 0; i--) {
            if (homeworkImages[i].homeworkSessionId === deleted[0].id) {
              homeworkImages.splice(i, 1);
            }
          }
          return deleted[0];
        }
        return null;
      },
    },
    homeworkImage: {
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const img = homeworkImages.find((i) => i.id === where.id) || null;
        if (img && include?.homeworkSession) {
          return { ...img, homeworkSession: homeworkSessions.find((s) => s.id === img.homeworkSessionId) || null };
        }
        return img;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        if (where?.homeworkSessionId) {
          return homeworkImages.filter((i) => i.homeworkSessionId === where.homeworkSessionId);
        }
        return homeworkImages;
      },
      count: async ({ where }: { where?: Record<string, unknown> }) => {
        if (where?.homeworkSessionId) {
          return homeworkImages.filter((i) => i.homeworkSessionId === where.homeworkSessionId).length;
        }
        return homeworkImages.length;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const image: MockHomeworkImage = {
          id: cuid(),
          homeworkSessionId: data.homeworkSessionId as string,
          imageUrl: data.imageUrl as string,
          originalFilename: (data.originalFilename as string) || null,
          sortOrder: (data.sortOrder as number) || 0,
          exifRotation: (data.exifRotation as number) || 0,
          privacyStripped: (data.privacyStripped as boolean) || false,
          createdAt: new Date(),
        };
        homeworkImages.push(image);
        return image;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const img = homeworkImages.find((i) => i.id === where.id);
        if (img) Object.assign(img, data);
        return img || null;
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        const idx = homeworkImages.findIndex((i) => i.id === where.id);
        if (idx >= 0) {
          const deleted = homeworkImages.splice(idx, 1);
          return deleted[0];
        }
        return null;
      },
    },
    sessionQuestion: {
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const q = sessionQuestions.find((sq) => sq.id === where.id) || null;
        if (q && include?.homeworkSession) {
          return { ...q, homeworkSession: homeworkSessions.find((s) => s.id === q.homeworkSessionId) || null };
        }
        return q;
      },
      findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
        return sessionQuestions.find((q) => {
          if (where?.id && q.id !== where.id) return false;
          if (where?.homeworkSessionId && q.homeworkSessionId !== where.homeworkSessionId) return false;
          return true;
        }) || null;
      },
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        if (where?.homeworkSessionId) {
          return sessionQuestions.filter((q) => q.homeworkSessionId === where.homeworkSessionId);
        }
        return sessionQuestions;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const q: MockSessionQuestion = {
          id: cuid(),
          homeworkSessionId: data.homeworkSessionId as string,
          questionNumber: data.questionNumber as number,
          questionType: (data.questionType as string) || null,
          content: data.content as string,
          studentAnswer: (data.studentAnswer as string) ?? null,
          correctAnswer: (data.correctAnswer as string) ?? null,
          isCorrect: (data.isCorrect as boolean) ?? null,
          confidence: (data.confidence as number) ?? null,
          needsReview: (data.needsReview as boolean) || false,
          imageRegion: data.imageRegion ?? null,
          aiKnowledgePoint: (data.aiKnowledgePoint as string) || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        sessionQuestions.push(q);
        return q;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const q = sessionQuestions.find((sq) => sq.id === where.id);
        if (q) Object.assign(q, data, { updatedAt: new Date() });
        return q || null;
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        const idx = sessionQuestions.findIndex((q) => q.id === where.id);
        if (idx >= 0) return sessionQuestions.splice(idx, 1)[0];
        return null;
      },
    },
    checkRound: {
      findFirst: async ({
        where,
        orderBy,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
      }) => {
        let result = [...checkRounds];
        if (where?.homeworkSessionId) {
          result = result.filter((r) => r.homeworkSessionId === where.homeworkSessionId);
        }
        if (orderBy?.roundNumber === "desc") {
          result.sort((a, b) => b.roundNumber - a.roundNumber);
        } else if (orderBy?.roundNumber === "asc") {
          result.sort((a, b) => a.roundNumber - b.roundNumber);
        }
        return result[0] ?? null;
      },
      findMany: async ({
        where,
        orderBy,
        include,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, unknown>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        include?: any;
      }) => {
        let result = [...checkRounds];
        if (where?.homeworkSessionId) {
          result = result.filter((r) => r.homeworkSessionId === where.homeworkSessionId);
        }
        if (orderBy?.roundNumber === "asc") {
          result.sort((a, b) => a.roundNumber - b.roundNumber);
        }
        if (include?.results) {
          return result.map((r) => ({
            ...r,
            results: roundQuestionResults.filter((rr) => rr.checkRoundId === r.id),
          }));
        }
        return result;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: async ({ data }: { data: any }) => {
        const round: MockCheckRound = {
          id: cuid(),
          homeworkSessionId: data.homeworkSessionId as string,
          roundNumber: data.roundNumber as number,
          score: data.score ?? null,
          totalQuestions: data.totalQuestions ?? null,
          correctCount: data.correctCount ?? null,
          createdAt: new Date(),
        };
        checkRounds.push(round);
        // Handle nested results.create
        if (data.results?.create && Array.isArray(data.results.create)) {
          for (const r of data.results.create as Array<Record<string, unknown>>) {
            roundQuestionResults.push({
              id: cuid(),
              checkRoundId: round.id,
              sessionQuestionId: r.sessionQuestionId as string,
              studentAnswer: (r.studentAnswer as string) ?? null,
              isCorrect: r.isCorrect as boolean,
              correctedFromPrev: (r.correctedFromPrev as boolean) ?? false,
            });
          }
        }
        return round;
      },
    },
    roundQuestionResult: {
      findMany: async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> }) => {
        let result = [...roundQuestionResults];
        if (where?.checkRoundId) {
          result = result.filter((r) => r.checkRoundId === where.checkRoundId);
        }
        if (where?.sessionQuestionId) {
          result = result.filter((r) => r.sessionQuestionId === where.sessionQuestionId);
        }
        // Handle nested checkRound filter
        if (where?.checkRound && typeof where.checkRound === "object") {
          const crWhere = where.checkRound as Record<string, unknown>;
          result = result.filter((rr) => {
            const cr = checkRounds.find((c) => c.id === rr.checkRoundId);
            if (!cr) return false;
            if (crWhere.homeworkSessionId && cr.homeworkSessionId !== crWhere.homeworkSessionId) return false;
            if (crWhere.createdAt && typeof crWhere.createdAt === "object") {
              const dateFilter = crWhere.createdAt as { gt?: Date };
              if (dateFilter.gt && cr.createdAt <= dateFilter.gt) return false;
            }
            return true;
          });
        }
        return result;
      },
    },
    helpRequest: {
      findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
        return helpRequests.find((h) => {
          if (where?.sessionQuestionId && h.sessionQuestionId !== where.sessionQuestionId) return false;
          if (where?.level !== undefined && h.level !== where.level) return false;
          if (where?.homeworkSessionId && h.homeworkSessionId !== where.homeworkSessionId) return false;
          return true;
        }) || null;
      },
      findMany: async ({ where, orderBy }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown> }) => {
        let result = [...helpRequests];
        if (where?.homeworkSessionId) {
          const hid = where.homeworkSessionId;
          if (typeof hid === "object" && hid !== null && "in" in hid) {
            result = result.filter((h) => (hid as { in: string[] }).in.includes(h.homeworkSessionId));
          } else {
            result = result.filter((h) => h.homeworkSessionId === hid);
          }
        }
        if (where?.sessionQuestionId) {
          result = result.filter((h) => h.sessionQuestionId === where.sessionQuestionId);
        }
        if (orderBy && "level" in orderBy && orderBy.level === "asc") {
          result.sort((a, b) => a.level - b.level);
        }
        return result;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const hr: MockHelpRequest = {
          id: cuid(),
          homeworkSessionId: data.homeworkSessionId as string,
          sessionQuestionId: data.sessionQuestionId as string,
          level: data.level as number,
          aiResponse: data.aiResponse as string,
          createdAt: new Date(),
        };
        helpRequests.push(hr);
        return hr;
      },
    },
    parentStudentConfig: {
      findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
        return parentStudentConfigs.find((c) => {
          if (where?.studentId && c.studentId !== where.studentId) return false;
          if (where?.parentId && c.parentId !== where.parentId) return false;
          return true;
        }) || null;
      },
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        const key = where.parentId_studentId as { parentId: string; studentId: string } | undefined;
        if (!key) return null;
        return (
          parentStudentConfigs.find(
            (c) => c.parentId === key.parentId && c.studentId === key.studentId,
          ) || null
        );
      },
      findMany: async ({ where }: { where?: Record<string, unknown> }) => {
        return parentStudentConfigs.filter((c) => {
          if (where?.parentId && c.parentId !== where.parentId) return false;
          if (where?.studentId && c.studentId !== where.studentId) return false;
          return true;
        });
      },
      upsert: async ({ where, create, update }: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const key = where.parentId_studentId as { parentId: string; studentId: string } | undefined;
        const existing = parentStudentConfigs.find(
          (c) => c.parentId === (key?.parentId ?? where.parentId) && c.studentId === (key?.studentId ?? where.studentId)
        );
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const newConfig: MockParentStudentConfig = {
          id: cuid(),
          parentId: create.parentId as string,
          studentId: create.studentId as string,
          maxHelpLevel: (create.maxHelpLevel as number) ?? 2,
          maxDailyTasks: (create.maxDailyTasks as number | undefined) ?? 10,
          learningTimeStart: (create.learningTimeStart as string | null | undefined) ?? null,
          learningTimeEnd: (create.learningTimeEnd as string | null | undefined) ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        parentStudentConfigs.push(newConfig);
        return newConfig;
      },
    },
    adminLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const entry: MockAdminLog = {
          id: cuid(),
          adminId: data.adminId as string,
          action: data.action as string,
          target: (data.target as string | null | undefined) ?? null,
          details: data.details ?? null,
          createdAt: new Date(),
        };
        adminLogs.push(entry);
        return entry;
      },
      findMany: async ({
        where,
        orderBy,
        take,
        select: _select,
      }: {
        where?: Record<string, unknown>;
        orderBy?: { createdAt?: "asc" | "desc" };
        take?: number;
        select?: Record<string, boolean>;
      }) => {
        let result = adminLogs.filter((l) => {
          if (where?.adminId && l.adminId !== where.adminId) return false;
          if (where?.target && l.target !== where.target) return false;
          if (where?.action && l.action !== where.action) return false;
          return true;
        });
        if (orderBy?.createdAt === "desc") {
          result = result.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else if (orderBy?.createdAt === "asc") {
          result = result.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        if (take !== undefined) result = result.slice(0, take);
        return result;
      },
    },
    errorQuestion: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: any }) => {
        const eq = errorQuestions.find((e) => e.id === where.id && e.deletedAt === null) || null;
        if (!eq || !include) return eq;
        let result: Record<string, unknown> = { ...eq };
        if (include.parentNotes) {
          let notes = parentNotes.filter((n) => n.errorQuestionId === eq.id);
          if (include.parentNotes.orderBy?.createdAt === "asc") {
            notes = notes.slice().sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
          }
          result.parentNotes = include.parentNotes.include?.parent
            ? notes.map((n) => ({ ...n, parent: users.find((u) => u.id === n.parentId) || null }))
            : notes;
        }
        return result;
      },
      findFirst: async ({ where }: { where?: Record<string, unknown> }) => {
        return errorQuestions.find((eq) => {
          if (eq.deletedAt !== null) return false;
          if (where?.studentId && eq.studentId !== where.studentId) return false;
          if (where?.contentHash && eq.contentHash !== where.contentHash) return false;
          if (where?.id && eq.id !== where.id) return false;
          return true;
        }) || null;
      },
      findMany: async ({ where, orderBy, skip, take }: { where?: Record<string, unknown>; orderBy?: Record<string, unknown>; skip?: number; take?: number; select?: Record<string, unknown> }) => {
        let result = errorQuestions.filter((eq) => {
          if (where?.deletedAt !== undefined ? eq.deletedAt !== null : eq.deletedAt !== null) return false;
          if (where?.studentId) {
            const sid = where.studentId;
            if (typeof sid === "object" && sid !== null && "in" in sid) {
              if (!(sid as { in: string[] }).in.includes(eq.studentId)) return false;
            } else {
              if (eq.studentId !== sid) return false;
            }
          }
          if (where?.subject && eq.subject !== where.subject) return false;
          if (where?.contentType && eq.contentType !== where.contentType) return false;
          if (where?.createdAt && typeof where.createdAt === "object") {
            const df = where.createdAt as { gte?: Date; lte?: Date; lt?: Date };
            if (df.gte && eq.createdAt < df.gte) return false;
            if (df.lte && eq.createdAt > df.lte) return false;
            if (df.lt && eq.createdAt >= df.lt) return false;
          }
          if (where?.content && typeof where.content === "object") {
            const cf = where.content as { contains?: string };
            if (cf.contains && !eq.content.toLowerCase().includes(cf.contains.toLowerCase())) return false;
          }
          return true;
        });
        if (orderBy?.createdAt === "desc") result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (skip != null) result = result.slice(skip);
        if (take != null) result = result.slice(0, take);
        return result;
      },
      count: async ({ where }: { where?: Record<string, unknown> }) => {
        return errorQuestions.filter((eq) => {
          if (eq.deletedAt !== null) return false;
          if (where?.studentId && eq.studentId !== where.studentId) return false;
          if (where?.subject && eq.subject !== where.subject) return false;
          if (where?.contentType && eq.contentType !== where.contentType) return false;
          if (where?.createdAt && typeof where.createdAt === "object") {
            const df = where.createdAt as { gte?: Date; lte?: Date; lt?: Date };
            if (df.gte && eq.createdAt < df.gte) return false;
            if (df.lte && eq.createdAt > df.lte) return false;
          }
          if (where?.content && typeof where.content === "object") {
            const cf = where.content as { contains?: string };
            if (cf.contains && !eq.content.toLowerCase().includes(cf.contains.toLowerCase())) return false;
          }
          return true;
        }).length;
      },
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const eq: MockErrorQuestion = {
          id: cuid(),
          studentId: data.studentId as string,
          sessionQuestionId: (data.sessionQuestionId as string) ?? null,
          subject: (data.subject as string) ?? "OTHER",
          contentType: (data.contentType as string) ?? null,
          grade: (data.grade as string) ?? null,
          questionType: (data.questionType as string) ?? null,
          content: data.content as string,
          contentHash: (data.contentHash as string) ?? null,
          studentAnswer: (data.studentAnswer as string) ?? null,
          correctAnswer: (data.correctAnswer as string) ?? null,
          errorAnalysis: null,
          aiKnowledgePoint: (data.aiKnowledgePoint as string) ?? null,
          imageUrl: null,
          totalAttempts: 1,
          correctAttempts: 0,
          isMastered: false,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        errorQuestions.push(eq);
        return eq;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const eq = errorQuestions.find((e) => e.id === where.id);
        if (eq) Object.assign(eq, data, { updatedAt: new Date() });
        return eq || null;
      },
    },
    parentNote: {
      findUnique: async ({ where }: { where: Record<string, unknown> }) => {
        return parentNotes.find((n) => n.id === where.id) || null;
      },
      create: async ({ data, include }: { data: Record<string, unknown>; include?: Record<string, unknown> }) => {
        const note: MockParentNote = {
          id: cuid(),
          parentId: data.parentId as string,
          errorQuestionId: data.errorQuestionId as string,
          content: data.content as string,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        parentNotes.push(note);
        if (include?.parent) {
          return { ...note, parent: users.find((u) => u.id === note.parentId) || null };
        }
        return note;
      },
      update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const note = parentNotes.find((n) => n.id === where.id);
        if (note) Object.assign(note, data, { updatedAt: new Date() });
        return note || null;
      },
      delete: async ({ where }: { where: Record<string, unknown> }) => {
        const idx = parentNotes.findIndex((n) => n.id === where.id);
        if (idx >= 0) return parentNotes.splice(idx, 1)[0];
        return null;
      },
    },
    // Sprint 18: LearningSuggestion
    learningSuggestion: {
      findMany: async ({ where, orderBy, take }: any) => {
        let items = learningSuggestions.filter(
          (s: any) => s.studentId === where?.studentId
        );
        if (orderBy?.createdAt === "desc") {
          items.sort(
            (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()
          );
        }
        if (take) items = items.slice(0, take);
        return items;
      },
      findFirst: async ({ where }: any) => {
        return learningSuggestions.find(
          (s: any) =>
            s.studentId === where?.studentId &&
            (!where?.type || s.type === where.type) &&
            (!where?.createdAt?.gte || s.createdAt >= where.createdAt.gte)
        ) ?? null;
      },
      findUnique: async ({ where }: any) => {
        if (where?.studentId_weekStart_type) {
          const { studentId, weekStart, type } = where.studentId_weekStart_type;
          return learningSuggestions.find(
            (s: any) =>
              s.studentId === studentId &&
              s.type === type &&
              s.weekStart.getTime() === weekStart.getTime()
          ) ?? null;
        }
        return learningSuggestions.find((s: any) => s.id === where?.id) ?? null;
      },
      create: async ({ data }: any) => {
        const row = { id: `ls-${Date.now()}`, ...data, createdAt: new Date() };
        learningSuggestions.push(row);
        return row;
      },
      upsert: async ({ where, create, update }: any) => {
        const existing = learningSuggestions.find(
          (s: any) =>
            s.studentId === where?.studentId_weekStart_type?.studentId &&
            s.type === where?.studentId_weekStart_type?.type
        );
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { id: `ls-${Date.now()}`, ...create, createdAt: new Date() };
        learningSuggestions.push(row);
        return row;
      },
    },

    // Sprint 18: InterventionHistory (read-only mock for tRPC tests)
    interventionHistory: {
      findMany: async ({ where, include, orderBy, take }: any) => {
        let items = interventionHistories.filter(
          (h: any) =>
            h.studentId === where?.studentId &&
            (!where?.createdAt?.gte || h.createdAt >= where.createdAt.gte)
        );
        if (orderBy?.createdAt === "desc") {
          items.sort(
            (a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime()
          );
        }
        if (take) items = items.slice(0, take);
        if (include?.knowledgePoint) {
          items = items.map((h: any) => ({
            ...h,
            knowledgePoint: { id: h.knowledgePointId, name: `KP-${h.knowledgePointId}` },
          }));
        }
        return items;
      },
    },

    // Sprint 18: MasteryState (read-only mock for tRPC tests)
    masteryState: {
      findMany: async ({ where, select }: any) => {
        return masteryStates.filter(
          (ms: any) =>
            ms.studentId === where?.studentId &&
            (!where?.knowledgePointId?.in || where.knowledgePointId.in.includes(ms.knowledgePointId))
        );
      },
      findUnique: async ({ where }: any) => {
        if (where?.studentId_knowledgePointId) {
          return masteryStates.find(
            (ms: any) =>
              ms.studentId === where.studentId_knowledgePointId.studentId &&
              ms.knowledgePointId === where.studentId_knowledgePointId.knowledgePointId
          ) ?? null;
        }
        return null;
      },
    },

    // Minimal TaskRun stub for ADR-013 global-task-progress. Routers call
    // findFirst → create → sometimes update; findMany for listActive.
    taskRun: {
      findFirst: async ({ where }: any) => {
        return (
          taskRuns.find(
            (t: any) =>
              (!where.userId || t.userId === where.userId) &&
              (!where.key || t.key === where.key) &&
              (!where.status ||
                (where.status.in
                  ? where.status.in.includes(t.status)
                  : t.status === where.status)),
          ) ?? null
        );
      },
      findMany: async ({ where }: any = { where: {} }) => {
        return taskRuns.filter(
          (t: any) =>
            (!where?.userId || t.userId === where.userId) &&
            (!where?.status?.in || where.status.in.includes(t.status)),
        );
      },
      create: async ({ data }: any) => {
        const row = {
          id: `task_mock_${++taskRunSeq}`,
          userId: data.userId,
          studentId: data.studentId ?? null,
          type: data.type,
          key: data.key,
          bullJobId: data.bullJobId ?? null,
          status: data.status ?? "QUEUED",
          step: data.step ?? null,
          progress: null,
          resultRef: null,
          errorCode: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          completedAt: null,
        };
        taskRuns.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const r = taskRuns.find((t: any) => t.id === where.id);
        if (!r) throw new Error("task not found");
        Object.assign(r, data, { updatedAt: new Date() });
        return r;
      },
    },

    // Expose internals for test assertions
    _learningSuggestions: learningSuggestions,
    _taskRuns: taskRuns,
    _interventionHistories: interventionHistories,
    _masteryStates: masteryStates,
    _users: users,
    _families: families,
    _familyMembers: familyMembers,
    _homeworkSessions: homeworkSessions,
    _homeworkImages: homeworkImages,
    _sessionQuestions: sessionQuestions,
    _checkRounds: checkRounds,
    _roundQuestionResults: roundQuestionResults,
    _helpRequests: helpRequests,
    _parentStudentConfigs: parentStudentConfigs,
    _adminLogs: adminLogs,
    _errorQuestions: errorQuestions,
    _parentNotes: parentNotes,
  };
}

export type MockDb = ReturnType<typeof createMockDb>;

export function createMockContext(
  db: MockDb,
  session: Context["session"] = null
): Context {
  const pino = require("pino");
  const noop = pino({ level: "silent" });
  return { db: db as unknown as Context["db"], session, requestId: "test", log: noop };
}
