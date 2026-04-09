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
      findUnique: async ({ where, include }: { where: Record<string, unknown>; include?: Record<string, unknown> }) => {
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
        return result;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findMany: async ({ where, orderBy, take, include }: { where?: Record<string, unknown>; orderBy?: any; take?: number; include?: any }) => {
        let result = [...homeworkSessions];
        if (where?.studentId) result = result.filter((s) => s.studentId === where.studentId);
        if (orderBy?.createdAt === "desc") result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (take) result = result.slice(0, take);
        if (include?._count?.select?.images) {
          return result.map((s) => ({
            ...s,
            _count: { images: homeworkImages.filter((i) => i.homeworkSessionId === s.id).length },
          }));
        }
        return result;
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
    // Expose internals for test assertions
    _users: users,
    _families: families,
    _familyMembers: familyMembers,
    _homeworkSessions: homeworkSessions,
    _homeworkImages: homeworkImages,
    _sessionQuestions: sessionQuestions,
  };
}

export type MockDb = ReturnType<typeof createMockDb>;

export function createMockContext(
  db: MockDb,
  session: Context["session"] = null
): Context {
  return { db: db as unknown as Context["db"], session };
}
