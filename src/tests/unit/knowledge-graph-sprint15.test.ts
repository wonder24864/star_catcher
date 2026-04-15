/**
 * Unit Tests: Sprint 15 knowledge-graph router extensions.
 *
 * 覆盖：
 *   - update.parentId 变化触发子树 depth 级联
 *   - reorderSiblings：sibling-only 校验 + sortOrder 写入
 *   - listLowConfidenceMappings：threshold / onlyUnverified 过滤
 *   - batchVerifyMappings：idempotent（AI_DETECTED only）
 *   - deleteMapping：hard delete + AdminLog
 *   - updateMapping：删旧 + 建新（ADMIN_VERIFIED）
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import type { Context } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);
const adminSession = { userId: "admin1", role: "ADMIN", grade: null, locale: "zh" };

type MockKP = {
  id: string;
  name: string;
  subject: string;
  schoolLevel: string;
  parentId: string | null;
  depth: number;
  sortOrder: number;
  deletedAt: Date | null;
};

type MockMapping = {
  id: string;
  questionId: string;
  knowledgePointId: string;
  mappingSource: "AI_DETECTED" | "ADMIN_VERIFIED";
  confidence: number;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
};

type MockQuestion = {
  id: string;
  content: string;
  subject: string;
};

let kps: MockKP[];
let mappings: MockMapping[];
let questions: MockQuestion[];
let adminLogs: Array<Record<string, unknown>>;
let idc: number;

function id() {
  return `x_${++idc}`;
}

function seedKP(o: Partial<MockKP> = {}): MockKP {
  const kp: MockKP = {
    id: o.id ?? id(),
    name: o.name ?? "KP",
    subject: o.subject ?? "MATH",
    schoolLevel: o.schoolLevel ?? "JUNIOR",
    parentId: o.parentId ?? null,
    depth: o.depth ?? 0,
    sortOrder: o.sortOrder ?? 0,
    deletedAt: null,
  };
  kps.push(kp);
  return kp;
}

function seedMapping(o: Partial<MockMapping> = {}): MockMapping {
  const m: MockMapping = {
    id: o.id ?? id(),
    questionId: o.questionId ?? "q1",
    knowledgePointId: o.knowledgePointId ?? "kp1",
    mappingSource: o.mappingSource ?? "AI_DETECTED",
    confidence: o.confidence ?? 0.5,
    verifiedBy: o.verifiedBy ?? null,
    verifiedAt: o.verifiedAt ?? null,
    createdAt: new Date(),
  };
  mappings.push(m);
  return m;
}

function seedQuestion(o: Partial<MockQuestion> = {}): MockQuestion {
  const q: MockQuestion = {
    id: o.id ?? id(),
    content: o.content ?? "问题内容",
    subject: o.subject ?? "MATH",
  };
  questions.push(q);
  return q;
}

// ─── Mock DB ─────────────────────────────────────────────────

type AnyRec = Record<string, unknown>;

function matchKPWhere(k: MockKP, where?: AnyRec): boolean {
  if (!where) return !k.deletedAt;
  if (where.deletedAt === null && k.deletedAt) return false;
  if (where.id) {
    if (typeof where.id === "object" && where.id !== null && "in" in where.id) {
      if (!(where.id as { in: string[] }).in.includes(k.id)) return false;
    } else if (where.id !== k.id) return false;
  }
  if (where.subject && where.subject !== k.subject) return false;
  if (where.schoolLevel && where.schoolLevel !== k.schoolLevel) return false;
  if (where.parentId !== undefined) {
    if (typeof where.parentId === "object" && where.parentId !== null && "in" in where.parentId) {
      if (!(where.parentId as { in: string[] }).in.includes(k.parentId as string)) return false;
    } else if (where.parentId !== k.parentId) return false;
  }
  return true;
}

function buildDb() {
  const kpOps = {
    findMany: vi.fn(async ({ where, select }: AnyRec = {}) => {
      const res = kps.filter((k) => matchKPWhere(k, where as AnyRec));
      // Always return enough fields for callers; select is a projection we simplify
      void select;
      return res.map((k) => ({ ...k }));
    }),
    findFirst: vi.fn(async ({ where }: AnyRec = {}) => {
      const res = kps.find((k) => matchKPWhere(k, where as AnyRec));
      return res ? { ...res } : null;
    }),
    update: vi.fn(async ({ where, data }: { where: AnyRec; data: AnyRec }) => {
      const k = kps.find((k) => k.id === where.id);
      if (k) Object.assign(k, data);
      return k ? { ...k } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: AnyRec; data: AnyRec }) => {
      let count = 0;
      for (const k of kps) {
        if (matchKPWhere(k, where)) {
          Object.assign(k, data);
          count++;
        }
      }
      return { count };
    }),
  };

  const mappingOps = {
    findMany: vi.fn(async ({ where, orderBy, skip, take }: AnyRec = {}) => {
      void orderBy;
      let res = mappings.filter((m) => {
        if (!where) return true;
        const w = where as AnyRec;
        if (w.confidence && typeof w.confidence === "object") {
          const cf = w.confidence as { lt?: number; lte?: number };
          if (cf.lt !== undefined && !(m.confidence < cf.lt)) return false;
        }
        if (w.verifiedAt === null && m.verifiedAt !== null) return false;
        if (w.mappingSource && w.mappingSource !== m.mappingSource) return false;
        if (w.id && typeof w.id === "object" && "in" in w.id) {
          if (!(w.id as { in: string[] }).in.includes(m.id)) return false;
        }
        // knowledgePoint filter: subject + schoolLevel
        if (w.knowledgePoint) {
          const kp = kps.find((k) => k.id === m.knowledgePointId);
          if (!kp) return false;
          const kpf = w.knowledgePoint as AnyRec;
          if (kpf.subject && kp.subject !== kpf.subject) return false;
          if (kpf.schoolLevel && kp.schoolLevel !== kpf.schoolLevel) return false;
        }
        return true;
      });
      if (skip) res = res.slice(skip as number);
      if (take) res = res.slice(0, take as number);
      // Embed relations for listLowConfidenceMappings
      return res.map((m) => ({
        ...m,
        question: questions.find((q) => q.id === m.questionId) ?? null,
        knowledgePoint: kps.find((k) => k.id === m.knowledgePointId) ?? null,
        verifier: m.verifiedBy ? { id: m.verifiedBy, nickname: "Admin" } : null,
      }));
    }),
    count: vi.fn(async ({ where }: AnyRec = {}) => {
      return mappings.filter((m) => {
        if (!where) return true;
        const w = where as AnyRec;
        if (w.confidence && typeof w.confidence === "object") {
          const cf = w.confidence as { lt?: number };
          if (cf.lt !== undefined && !(m.confidence < cf.lt)) return false;
        }
        if (w.verifiedAt === null && m.verifiedAt !== null) return false;
        return true;
      }).length;
    }),
    findUnique: vi.fn(async ({ where }: AnyRec = {}) => {
      const w = where as AnyRec;
      if (w.id) return mappings.find((m) => m.id === w.id) ?? null;
      if (w.questionId_knowledgePointId) {
        const c = w.questionId_knowledgePointId as { questionId: string; knowledgePointId: string };
        return mappings.find((m) =>
          m.questionId === c.questionId && m.knowledgePointId === c.knowledgePointId,
        ) ?? null;
      }
      return null;
    }),
    create: vi.fn(async ({ data }: { data: AnyRec }) => {
      const m: MockMapping = {
        id: id(),
        questionId: data.questionId as string,
        knowledgePointId: data.knowledgePointId as string,
        mappingSource: (data.mappingSource as "AI_DETECTED" | "ADMIN_VERIFIED") ?? "AI_DETECTED",
        confidence: (data.confidence as number) ?? 0.8,
        verifiedBy: (data.verifiedBy as string) ?? null,
        verifiedAt: (data.verifiedAt as Date) ?? null,
        createdAt: new Date(),
      };
      mappings.push(m);
      return m;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: AnyRec; data: AnyRec }) => {
      let count = 0;
      for (const m of mappings) {
        const w = where as AnyRec;
        if (w.id && typeof w.id === "object" && "in" in w.id) {
          if (!(w.id as { in: string[] }).in.includes(m.id)) continue;
        }
        if (w.mappingSource && w.mappingSource !== m.mappingSource) continue;
        Object.assign(m, data);
        count++;
      }
      return { count };
    }),
    delete: vi.fn(async ({ where }: { where: AnyRec }) => {
      const idx = mappings.findIndex((m) => m.id === where.id);
      if (idx >= 0) return mappings.splice(idx, 1)[0];
      return null;
    }),
  };

  const db: AnyRec = {
    knowledgePoint: kpOps,
    questionKnowledgeMapping: mappingOps,
    adminLog: {
      create: vi.fn(async ({ data }: { data: AnyRec }) => {
        adminLogs.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        // Interactive transaction — pass `db` itself as tx client
        return (arg as (tx: unknown) => Promise<unknown>)(db);
      }
      if (Array.isArray(arg)) {
        return Promise.all(arg as Promise<unknown>[]);
      }
      return null;
    }),
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
  };
  return db;
}

let db: ReturnType<typeof buildDb>;

beforeEach(() => {
  kps = [];
  mappings = [];
  questions = [];
  adminLogs = [];
  idc = 0;
  db = buildDb();
});

function getCaller(session = adminSession) {
  const pino = require("pino");
  const ctx: Context = {
    db: db as unknown as Context["db"],
    session,
    requestId: "test",
    log: pino({ level: "silent" }),
  };
  return createCaller(ctx);
}

// ═══════════════════════════════════════════════════════════════
// update: parentId change → depth cascade
// ═══════════════════════════════════════════════════════════════

describe("knowledgeGraph.update depth cascade (Sprint 15)", () => {
  test("移动节点到新父节点时，子孙 depth 全部重算", async () => {
    // Tree:  root(0) -> A(1) -> B(2) -> C(3)
    //        root2(0)
    const root = seedKP({ name: "root", depth: 0 });
    const rootB = seedKP({ name: "root2", depth: 0 });
    const A = seedKP({ name: "A", parentId: root.id, depth: 1 });
    const B = seedKP({ name: "B", parentId: A.id, depth: 2 });
    const C = seedKP({ name: "C", parentId: B.id, depth: 3 });

    const caller = getCaller();
    // Move A under root2 → A.depth should be 1 (root2.depth + 1), B=2, C=3
    await caller.knowledgeGraph.update({ id: A.id, parentId: rootB.id });

    const fresh = (ref: MockKP) => kps.find((k) => k.id === ref.id)!;
    expect(fresh(A).depth).toBe(1);
    expect(fresh(B).depth).toBe(2);
    expect(fresh(C).depth).toBe(3);
  });

  test("拒绝移到自己的后代（cycle）", async () => {
    const root = seedKP({ name: "R", depth: 0 });
    const child = seedKP({ name: "C", parentId: root.id, depth: 1 });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.update({ id: root.id, parentId: child.id }),
    ).rejects.toThrow(/descendant|cycle/i);
  });

  test("拒绝把自己设为自己的 parent", async () => {
    const a = seedKP({ name: "A", depth: 0 });
    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.update({ id: a.id, parentId: a.id }),
    ).rejects.toThrow();
  });

  test("移到根（parentId=null）时 depth=0", async () => {
    const root = seedKP({ name: "R", depth: 0 });
    const a = seedKP({ name: "A", parentId: root.id, depth: 1 });
    const b = seedKP({ name: "B", parentId: a.id, depth: 2 });

    const caller = getCaller();
    await caller.knowledgeGraph.update({ id: a.id, parentId: null });

    expect(kps.find((k) => k.id === a.id)!.depth).toBe(0);
    expect(kps.find((k) => k.id === b.id)!.depth).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// reorderSiblings
// ═══════════════════════════════════════════════════════════════

describe("knowledgeGraph.reorderSiblings (Sprint 15)", () => {
  test("按新顺序更新同父 siblings 的 sortOrder", async () => {
    const parent = seedKP({ name: "P" });
    const a = seedKP({ name: "A", parentId: parent.id, sortOrder: 0 });
    const b = seedKP({ name: "B", parentId: parent.id, sortOrder: 1 });
    const c = seedKP({ name: "C", parentId: parent.id, sortOrder: 2 });

    const caller = getCaller();
    await caller.knowledgeGraph.reorderSiblings({
      parentId: parent.id,
      orderedIds: [c.id, a.id, b.id],
    });

    expect(kps.find((k) => k.id === c.id)!.sortOrder).toBe(0);
    expect(kps.find((k) => k.id === a.id)!.sortOrder).toBe(1);
    expect(kps.find((k) => k.id === b.id)!.sortOrder).toBe(2);
  });

  test("拒绝混合不同父的 ids", async () => {
    const p1 = seedKP({ name: "P1" });
    const p2 = seedKP({ name: "P2" });
    const a = seedKP({ name: "A", parentId: p1.id });
    const b = seedKP({ name: "B", parentId: p2.id });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.reorderSiblings({
        parentId: p1.id,
        orderedIds: [a.id, b.id],
      }),
    ).rejects.toThrow(/same parent/i);
  });

  test("拒绝混合不同 subject", async () => {
    const parent = seedKP({ name: "P" });
    const a = seedKP({ name: "A", parentId: parent.id, subject: "MATH" });
    const b = seedKP({ name: "B", parentId: parent.id, subject: "CHINESE" });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.reorderSiblings({
        parentId: parent.id,
        orderedIds: [a.id, b.id],
      }),
    ).rejects.toThrow(/subject/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// listLowConfidenceMappings
// ═══════════════════════════════════════════════════════════════

describe("knowledgeGraph.listLowConfidenceMappings (Sprint 15)", () => {
  test("按 threshold 过滤置信度", async () => {
    const q = seedQuestion();
    const kp = seedKP();
    seedMapping({ questionId: q.id, knowledgePointId: kp.id, confidence: 0.4 });
    seedMapping({ questionId: q.id, knowledgePointId: kp.id, confidence: 0.9 });

    const caller = getCaller();
    const res = await caller.knowledgeGraph.listLowConfidenceMappings({
      threshold: 0.7,
      page: 1,
      pageSize: 20,
      onlyUnverified: false,
    });

    expect(res.total).toBe(1);
    expect(res.items[0].confidence).toBe(0.4);
  });

  test("onlyUnverified=true 只返回 verifiedAt=null 的记录", async () => {
    const q = seedQuestion();
    const kp = seedKP();
    seedMapping({ questionId: q.id, knowledgePointId: kp.id, confidence: 0.4 });
    seedMapping({
      questionId: q.id,
      knowledgePointId: kp.id,
      confidence: 0.5,
      verifiedAt: new Date(),
      verifiedBy: "admin1",
      mappingSource: "ADMIN_VERIFIED",
    });

    const caller = getCaller();
    const res = await caller.knowledgeGraph.listLowConfidenceMappings({
      threshold: 0.7,
      onlyUnverified: true,
      page: 1,
      pageSize: 20,
    });

    expect(res.items.every((i) => i.verifiedAt === null)).toBe(true);
  });

  test("contentPreview 截取前 60 字", async () => {
    const q = seedQuestion({ content: "一".repeat(200) });
    const kp = seedKP();
    seedMapping({ questionId: q.id, knowledgePointId: kp.id, confidence: 0.5 });

    const caller = getCaller();
    const res = await caller.knowledgeGraph.listLowConfidenceMappings({
      threshold: 0.7,
      onlyUnverified: false,
      page: 1,
      pageSize: 20,
    });

    expect(res.items[0].question.contentPreview.length).toBe(60);
  });
});

// ═══════════════════════════════════════════════════════════════
// batchVerifyMappings
// ═══════════════════════════════════════════════════════════════

describe("knowledgeGraph.batchVerifyMappings (Sprint 15)", () => {
  test("批量确认后写入 verifiedBy/At + 更新 mappingSource", async () => {
    const m1 = seedMapping({ mappingSource: "AI_DETECTED" });
    const m2 = seedMapping({ mappingSource: "AI_DETECTED" });

    const caller = getCaller();
    const res = await caller.knowledgeGraph.batchVerifyMappings({
      mappingIds: [m1.id, m2.id],
    });

    expect(res.count).toBe(2);
    for (const m of [m1, m2]) {
      const fresh = mappings.find((x) => x.id === m.id)!;
      expect(fresh.mappingSource).toBe("ADMIN_VERIFIED");
      expect(fresh.verifiedBy).toBe("admin1");
      expect(fresh.verifiedAt).toBeInstanceOf(Date);
    }
    expect(adminLogs.some((l) => l.action === "verify-mappings")).toBe(true);
  });

  test("幂等：ADMIN_VERIFIED 的记录不会被重复确认", async () => {
    const m1 = seedMapping({ mappingSource: "ADMIN_VERIFIED", verifiedBy: "other" });
    const m2 = seedMapping({ mappingSource: "AI_DETECTED" });

    const caller = getCaller();
    const res = await caller.knowledgeGraph.batchVerifyMappings({
      mappingIds: [m1.id, m2.id],
    });

    expect(res.count).toBe(1); // 只有 m2
    expect(mappings.find((x) => x.id === m1.id)!.verifiedBy).toBe("other"); // 未被改
  });
});

// ═══════════════════════════════════════════════════════════════
// deleteMapping + updateMapping
// ═══════════════════════════════════════════════════════════════

describe("knowledgeGraph.deleteMapping (Sprint 15)", () => {
  test("硬删除 + 写 AdminLog", async () => {
    const m = seedMapping();
    const caller = getCaller();

    const res = await caller.knowledgeGraph.deleteMapping({ id: m.id });
    expect(res.deleted).toBe(true);
    expect(mappings.find((x) => x.id === m.id)).toBeUndefined();
    expect(adminLogs.some((l) => l.action === "delete-mapping")).toBe(true);
  });

  test("不存在则 NOT_FOUND", async () => {
    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.deleteMapping({ id: "ghost" }),
    ).rejects.toThrow(TRPCError);
  });
});

describe("knowledgeGraph.updateMapping (Sprint 15)", () => {
  test("换 KP：删旧 + 建新（ADMIN_VERIFIED, confidence=1.0）", async () => {
    const kpOld = seedKP({ name: "old" });
    const kpNew = seedKP({ name: "new" });
    const m = seedMapping({ knowledgePointId: kpOld.id });

    const caller = getCaller();
    const created = await caller.knowledgeGraph.updateMapping({
      id: m.id,
      newKnowledgePointId: kpNew.id,
    });

    expect(created.knowledgePointId).toBe(kpNew.id);
    expect(created.mappingSource).toBe("ADMIN_VERIFIED");
    expect(created.confidence).toBe(1.0);
    expect(created.verifiedBy).toBe("admin1");
    expect(mappings.find((x) => x.id === m.id)).toBeUndefined(); // 旧的已删
    expect(adminLogs.some((l) => l.action === "update-mapping")).toBe(true);
  });

  test("换到同一个 KP 时拒绝", async () => {
    const kp = seedKP();
    const m = seedMapping({ knowledgePointId: kp.id });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.updateMapping({ id: m.id, newKnowledgePointId: kp.id }),
    ).rejects.toThrow(/already/i);
  });

  test("如果 question 已映射到目标 KP，抛 CONFLICT", async () => {
    const kp1 = seedKP({ name: "kp1" });
    const kp2 = seedKP({ name: "kp2" });
    const m1 = seedMapping({ questionId: "q1", knowledgePointId: kp1.id });
    seedMapping({ questionId: "q1", knowledgePointId: kp2.id });

    const caller = getCaller();
    await expect(
      caller.knowledgeGraph.updateMapping({ id: m1.id, newKnowledgePointId: kp2.id }),
    ).rejects.toThrow(/already mapped/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// RBAC
// ═══════════════════════════════════════════════════════════════

describe("Sprint 15 RBAC", () => {
  const studentSession = { userId: "s1", role: "STUDENT", grade: null, locale: "zh" };

  test("STUDENT 不能调用 reorderSiblings", async () => {
    const caller = getCaller(studentSession);
    await expect(
      caller.knowledgeGraph.reorderSiblings({ parentId: null, orderedIds: ["x"] }),
    ).rejects.toThrow();
  });

  test("STUDENT 不能调用 batchVerifyMappings", async () => {
    const caller = getCaller(studentSession);
    await expect(
      caller.knowledgeGraph.batchVerifyMappings({ mappingIds: ["x"] }),
    ).rejects.toThrow();
  });
});
