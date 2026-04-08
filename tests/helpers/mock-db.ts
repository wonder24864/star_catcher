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

let counter = 0;
function cuid() {
  return `test_${++counter}_${Date.now()}`;
}

export function createMockDb() {
  const users: MockUser[] = [];
  const families: MockFamily[] = [];
  const familyMembers: MockFamilyMember[] = [];

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
    // Expose internals for test assertions
    _users: users,
    _families: families,
    _familyMembers: familyMembers,
  };
}

export type MockDb = ReturnType<typeof createMockDb>;

export function createMockContext(
  db: MockDb,
  session: Context["session"] = null
): Context {
  return { db: db as unknown as Context["db"], session };
}
