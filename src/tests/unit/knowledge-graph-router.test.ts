/**
 * Unit Tests: Knowledge Graph Router
 * Tests tRPC knowledge graph procedures with mock DB.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import type { Context } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);
const adminSession = { userId: "admin1", role: "ADMIN", grade: null, locale: "zh" };

// ─── Mock KnowledgePoint data ───

type MockKP = {
  id: string;
  externalId: string | null;
  name: string;
  description: string | null;
  subject: string;
  grade: string | null;
  schoolLevel: string;
  parentId: string | null;
  depth: number;
  difficulty: number;
  importance: number;
  examFrequency: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type MockRelation = {
  id: string;
  fromPointId: string;
  toPointId: string;
  type: string;
  strength: number;
  createdAt: Date;
};

let knowledgePoints: MockKP[];
let relations: MockRelation[];
let adminLogs: Array<Record<string, unknown>>;
let idCounter: number;

function cuid() {
  return `kp_${++idCounter}`;
}

function seedKP(overrides: Partial<MockKP> = {}): MockKP {
  const kp: MockKP = {
    id: overrides.id ?? cuid(),
    externalId: null,
    name: overrides.name ?? "Test KP",
    description: null,
    subject: overrides.subject ?? "MATH",
    grade: overrides.grade ?? "PRIMARY_3",
    schoolLevel: overrides.schoolLevel ?? "PRIMARY",
    parentId: overrides.parentId ?? null,
    depth: overrides.depth ?? 0,
    difficulty: overrides.difficulty ?? 3,
    importance: overrides.importance ?? 3,
    examFrequency: overrides.examFrequency ?? 3,
    metadata: overrides.metadata ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: overrides.deletedAt ?? null,
  };
  knowledgePoints.push(kp);
  return kp;
}

// ─── Build mock DB ───

function buildMockDb() {
  return {
    knowledgePoint: {
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        return filterKPs(where).length;
      }),
      findMany: vi.fn(async ({ where, select, orderBy, skip, take, include }: Record<string, unknown>) => {
        let results = filterKPs(where as Record<string, unknown>);
        if (skip) results = results.slice(skip as number);
        if (take) results = results.slice(0, take as number);
        // Add _count if include requests it
        if (include && (include as Record<string, unknown>)._count) {
          return results.map((r) => ({ ...r, _count: { questionMappings: 0, children: knowledgePoints.filter((c) => c.parentId === r.id && !c.deletedAt).length } }));
        }
        if (select && (select as Record<string, unknown>)._count) {
          return results.map((r) => ({ ...r, _count: { questionMappings: 0 } }));
        }
        return results;
      }),
      findFirst: vi.fn(async ({ where, select, include }: Record<string, unknown>) => {
        const results = filterKPs(where as Record<string, unknown>);
        const found = results[0] ?? null;
        if (!found) return null;
        // Always include _count if select or include requests it
        const _count = { questionMappings: 0, children: knowledgePoints.filter((c) => c.parentId === found.id && !c.deletedAt).length };
        if (include) {
          return {
            ...found,
            parent: found.parentId ? knowledgePoints.find((k) => k.id === found.parentId) ?? null : null,
            children: knowledgePoints.filter((k) => k.parentId === found.id && !k.deletedAt),
            relationsFrom: relations.filter((r) => r.fromPointId === found.id).map((r) => ({ ...r, toPoint: knowledgePoints.find((k) => k.id === r.toPointId) })),
            relationsTo: relations.filter((r) => r.toPointId === found.id).map((r) => ({ ...r, fromPoint: knowledgePoints.find((k) => k.id === r.fromPointId) })),
            _count,
          };
        }
        if (select && (select as Record<string, unknown>)._count) {
          return { ...found, _count };
        }
        return found;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const kp: MockKP = {
          id: cuid(),
          externalId: (data.externalId as string) ?? null,
          name: data.name as string,
          description: (data.description as string) ?? null,
          subject: data.subject as string,
          grade: (data.grade as string) ?? null,
          schoolLevel: data.schoolLevel as string,
          parentId: (data.parentId as string) ?? null,
          depth: (data.depth as number) ?? 0,
          difficulty: (data.difficulty as number) ?? 3,
          importance: (data.importance as number) ?? 3,
          examFrequency: (data.examFrequency as number) ?? 3,
          metadata: (data.metadata as Record<string, unknown>) ?? {},
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        };
        knowledgePoints.push(kp);
        return kp;
      }),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const kp = knowledgePoints.find((k) => k.id === where.id);
        if (kp) Object.assign(kp, data, { updatedAt: new Date() });
        return kp;
      }),
    },
    knowledgeRelation: {
      findFirst: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        return relations.find((r) => {
          if (where?.fromPointId && r.fromPointId !== where.fromPointId) return false;
          if (where?.toPointId && r.toPointId !== where.toPointId) return false;
          if (where?.type && r.type !== where.type) return false;
          return true;
        }) ?? null;
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return relations.find((r) => r.id === where.id) ?? null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const rel: MockRelation = {
          id: cuid(),
          fromPointId: data.fromPointId as string,
          toPointId: data.toPointId as string,
          type: data.type as string,
          strength: (data.strength as number) ?? 1.0,
          createdAt: new Date(),
        };
        relations.push(rel);
        return rel;
      }),
      delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const idx = relations.findIndex((r) => r.id === where.id);
        if (idx >= 0) return relations.splice(idx, 1)[0];
        return null;
      }),
    },
    adminLog: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        adminLogs.push(data);
        return data;
      }),
    },
    $queryRaw: vi.fn(async () => [{ hasCycle: false }]),
    $executeRaw: vi.fn(async () => 0),
  };
}

function filterKPs(where?: Record<string, unknown>): MockKP[] {
  if (!where) return knowledgePoints.filter((k) => !k.deletedAt);
  return knowledgePoints.filter((k) => {
    if (k.deletedAt) return false;
    if (where.id) {
      if (typeof where.id === "object" && where.id !== null && "in" in where.id) {
        if (!(where.id as { in: string[] }).in.includes(k.id)) return false;
      } else if (k.id !== where.id) return false;
    }
    if (where.subject && k.subject !== where.subject) return false;
    if (where.grade && k.grade !== where.grade) return false;
    if (where.schoolLevel && k.schoolLevel !== where.schoolLevel) return false;
    if (where.parentId !== undefined && k.parentId !== where.parentId) return false;
    if (where.name && typeof where.name === "object") {
      const nameFilter = where.name as { contains?: string; mode?: string };
      if (nameFilter.contains && !k.name.toLowerCase().includes(nameFilter.contains.toLowerCase())) return false;
    }
    // Handle OR clause (used by search)
    if (where.OR && Array.isArray(where.OR)) {
      const orClauses = where.OR as Array<Record<string, unknown>>;
      const matchesAny = orClauses.some((clause) => {
        if (clause.name && typeof clause.name === "object") {
          const nameFilter = clause.name as { contains?: string; mode?: string };
          if (nameFilter.contains) {
            return k.name.toLowerCase().includes(nameFilter.contains.toLowerCase());
          }
        }
        if (clause.description && typeof clause.description === "object") {
          const descFilter = clause.description as { contains?: string; mode?: string };
          if (descFilter.contains) {
            return (k.description ?? "").toLowerCase().includes(descFilter.contains.toLowerCase());
          }
        }
        return false;
      });
      if (!matchesAny) return false;
    }
    return true;
  });
}

// ─── Tests ───

let db: ReturnType<typeof buildMockDb>;

beforeEach(() => {
  knowledgePoints = [];
  relations = [];
  adminLogs = [];
  idCounter = 0;
  db = buildMockDb();
});

function getCaller(session = adminSession) {
  const pino = require("pino");
  const ctx: Context = { db: db as unknown as Context["db"], session, requestId: "test", log: pino({ level: "silent" }) };
  return createCaller(ctx);
}

describe("knowledgeGraph.list", () => {
  test("returns paginated results", async () => {
    seedKP({ name: "有理数", subject: "MATH" });
    seedKP({ name: "整式", subject: "MATH" });
    seedKP({ name: "古诗词", subject: "CHINESE" });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.list({ page: 1, pageSize: 10 });

    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(3);
    expect(result.page).toBe(1);
  });

  test("filters by subject", async () => {
    seedKP({ name: "有理数", subject: "MATH" });
    seedKP({ name: "古诗词", subject: "CHINESE" });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.list({ subject: "MATH", page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe("有理数");
  });

  test("searches by name (case insensitive)", async () => {
    seedKP({ name: "有理数的加法" });
    seedKP({ name: "有理数的减法" });
    seedKP({ name: "整式" });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.list({ search: "有理数", page: 1, pageSize: 10 });

    expect(result.total).toBe(2);
  });

  test("excludes soft-deleted points", async () => {
    seedKP({ name: "Active" });
    seedKP({ name: "Deleted", deletedAt: new Date() });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.list({ page: 1, pageSize: 10 });

    expect(result.total).toBe(1);
    expect(result.items[0].name).toBe("Active");
  });
});

describe("knowledgeGraph.create", () => {
  test("creates knowledge point with correct depth", async () => {
    const parent = seedKP({ name: "有理数", depth: 0 });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.create({
      name: "有理数的加法",
      subject: "MATH",
      schoolLevel: "JUNIOR",
      parentId: parent.id,
    });

    expect(result.name).toBe("有理数的加法");
    expect(result.depth).toBe(1);
    expect(result.parentId).toBe(parent.id);
  });

  test("creates root node with depth 0", async () => {
    const caller = getCaller();
    const result = await caller.knowledgeGraph.create({
      name: "代数",
      subject: "MATH",
      schoolLevel: "JUNIOR",
    });

    expect(result.depth).toBe(0);
    expect(result.parentId).toBeNull();
  });

  test("rejects if parent not found", async () => {
    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.create({
        name: "Orphan",
        subject: "MATH",
        schoolLevel: "JUNIOR",
        parentId: "nonexistent",
      }),
    ).rejects.toThrow(TRPCError);
  });

  test("creates audit log", async () => {
    const caller = getCaller();
    await caller.knowledgeGraph.create({
      name: "测试",
      subject: "MATH",
      schoolLevel: "PRIMARY",
    });

    expect(adminLogs).toHaveLength(1);
    expect(adminLogs[0].action).toBe("CREATE_KNOWLEDGE_POINT");
    expect(adminLogs[0].adminId).toBe("admin1");
  });
});

describe("knowledgeGraph.delete", () => {
  test("soft-deletes a knowledge point", async () => {
    const kp = seedKP({ name: "To Delete" });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.delete({ id: kp.id });

    expect(result.success).toBe(true);
    expect(kp.deletedAt).not.toBeNull();
  });

  test("returns NOT_FOUND for non-existent point", async () => {
    const caller = getCaller();
    await expect(caller.knowledgeGraph.delete({ id: "nope" })).rejects.toThrow(TRPCError);
  });
});

describe("knowledgeGraph.addRelation", () => {
  test("creates a relation between two points", async () => {
    const from = seedKP({ name: "A" });
    const to = seedKP({ name: "B" });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.addRelation({
      fromId: from.id,
      toId: to.id,
      type: "PREREQUISITE",
    });

    expect(result.fromPointId).toBe(from.id);
    expect(result.toPointId).toBe(to.id);
    expect(result.type).toBe("PREREQUISITE");
  });

  test("rejects self-relation", async () => {
    const kp = seedKP({ name: "Self" });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.addRelation({ fromId: kp.id, toId: kp.id, type: "PARALLEL" }),
    ).rejects.toThrow("Cannot create self-relation");
  });

  test("rejects duplicate relation", async () => {
    const from = seedKP({ name: "A" });
    const to = seedKP({ name: "B" });
    relations.push({
      id: "rel1",
      fromPointId: from.id,
      toPointId: to.id,
      type: "PREREQUISITE",
      strength: 1.0,
      createdAt: new Date(),
    });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.addRelation({ fromId: from.id, toId: to.id, type: "PREREQUISITE" }),
    ).rejects.toThrow("Relation already exists");
  });

  test("detects cycle for PREREQUISITE", async () => {
    const from = seedKP({ name: "A" });
    const to = seedKP({ name: "B" });

    // Mock $queryRaw to return hasCycle: true
    db.$queryRaw.mockResolvedValueOnce([{ hasCycle: true }]);

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.addRelation({ fromId: from.id, toId: to.id, type: "PREREQUISITE" }),
    ).rejects.toThrow("cycle");
  });
});

describe("knowledgeGraph.batchUpdateStatus", () => {
  test("updates multiple points' importStatus", async () => {
    const kp1 = seedKP({ name: "KP1", metadata: { importStatus: "pending_review" } });
    const kp2 = seedKP({ name: "KP2", metadata: { importStatus: "pending_review" } });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.batchUpdateStatus({
      ids: [kp1.id, kp2.id],
      importStatus: "approved",
    });

    expect(result.updated).toBe(2);
    expect(db.$executeRaw).toHaveBeenCalled();
  });

  test("rejects if some points not found", async () => {
    seedKP({ id: "existing" });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.batchUpdateStatus({
        ids: ["existing", "nonexistent"],
        importStatus: "approved",
      }),
    ).rejects.toThrow("not found");
  });
});

describe("knowledgeGraph.search", () => {
  test("searches by name", async () => {
    seedKP({ name: "有理数的加法" });
    seedKP({ name: "有理数的减法" });
    seedKP({ name: "整式加减" });

    const caller = getCaller();
    const result = await caller.knowledgeGraph.search({ query: "有理数" });

    expect(result).toHaveLength(2);
  });
});
