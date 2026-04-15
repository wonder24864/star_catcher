/**
 * Unit Tests: brain router (Sprint 15 US-057)
 *
 * 覆盖 listRuns / studentStatus / stats 三个 procedure 的主路径 + RBAC。
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import type { Context } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);
const adminSession = { userId: "admin1", role: "ADMIN", grade: null, locale: "zh" };

type MockLog = {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  details: Record<string, unknown>;
  createdAt: Date;
};

type MockUser = {
  id: string;
  nickname: string;
  username: string;
  role: string;
};

let logs: MockLog[];
let users: MockUser[];
let redisTtlMock: (key: string) => Promise<number>;

/**
 * Mock for Prisma.Sql template — applies filters encoded in the SQL by
 * inspecting the textual template (studentId / date / skippedOnly markers)
 * and parameter values.
 */
function runMockSql(sql: { strings?: readonly string[]; values?: unknown[] }): unknown[] {
  const text = (sql.strings ?? []).join(" ");
  const values = sql.values ?? [];

  const isCount = /COUNT\(\*\)/.test(text);
  const hasTarget = /"target"\s*=/.test(text);
  const hasFrom = /"createdAt"\s*>=/.test(text);
  const hasTo = /"createdAt"\s*<=/.test(text);
  const hasSkippedOnly = /jsonb_array_length/.test(text);

  let vIdx = 0;
  const studentId = hasTarget ? (values[vIdx++] as string) : undefined;
  const dateFrom = hasFrom ? (values[vIdx++] as Date) : undefined;
  const dateTo = hasTo ? (values[vIdx++] as Date) : undefined;
  const limit = !isCount ? (values[vIdx++] as number) : undefined;
  const offset = !isCount ? (values[vIdx++] as number) : undefined;

  let res = logs.filter((l) => {
    if (l.action !== "brain-run") return false;
    if (studentId && l.target !== studentId) return false;
    if (dateFrom && l.createdAt < dateFrom) return false;
    if (dateTo && l.createdAt > dateTo) return false;
    if (hasSkippedOnly) {
      const d = l.details as {
        agentsLaunched?: unknown[];
        skipped?: unknown[];
      };
      const launched = d.agentsLaunched ?? [];
      const skipped = d.skipped ?? [];
      if (launched.length !== 0 || skipped.length === 0) return false;
    }
    return true;
  });

  if (isCount) {
    return [{ count: res.length }];
  }

  res = res.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  if (typeof offset === "number") res = res.slice(offset);
  if (typeof limit === "number") res = res.slice(0, limit);
  return res;
}

function buildDb() {
  return {
    $queryRaw: vi.fn(async (sql: { strings?: readonly string[]; values?: unknown[] }) =>
      runMockSql(sql),
    ),
    adminLog: {
      // kept for legacy tests (studentStatus still uses findMany)
      findMany: vi.fn(async ({ where, orderBy, skip, take }: Record<string, unknown>) => {
        void orderBy;
        let res = logs.filter((l) => {
          const w = where as Record<string, unknown>;
          if (!w) return true;
          if (w.action && w.action !== l.action) return false;
          if (w.target && w.target !== l.target) return false;
          if (w.createdAt) {
            const c = w.createdAt as { gte?: Date; lte?: Date };
            if (c.gte && l.createdAt < c.gte) return false;
            if (c.lte && l.createdAt > c.lte) return false;
          }
          return true;
        });
        res = res.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (skip) res = res.slice(skip as number);
        if (take) res = res.slice(0, take as number);
        return res;
      }),
    },
    user: {
      findMany: vi.fn(async ({ where }: Record<string, unknown>) => {
        const w = where as { id?: { in: string[] } };
        if (w.id?.in) {
          return users.filter((u) => w.id!.in.includes(u.id));
        }
        return users;
      }),
      findUnique: vi.fn(async ({ where }: Record<string, unknown>) => {
        const w = where as { id: string };
        return users.find((u) => u.id === w.id) ?? null;
      }),
    },
  };
}

// Mock redis with configurable ttl
vi.mock("@/lib/infra/redis", () => ({
  redis: {
    ttl: vi.fn((key: string) => redisTtlMock(key)),
  },
}));

let db: ReturnType<typeof buildDb>;

beforeEach(() => {
  logs = [];
  users = [];
  redisTtlMock = async () => -2; // default: key doesn't exist
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

function seedBrainRun(overrides: Partial<MockLog> = {}, details: Record<string, unknown> = {}): MockLog {
  const log: MockLog = {
    id: `log_${logs.length + 1}`,
    adminId: "system",
    action: "brain-run",
    target: overrides.target ?? "student1",
    details: {
      studentId: overrides.target ?? "student1",
      eventsProcessed: 3,
      agentsLaunched: [{ jobName: "intervention-planning", reason: "new-errors" }],
      skipped: [],
      durationMs: 1200,
      ...details,
    },
    createdAt: overrides.createdAt ?? new Date(),
  };
  logs.push(log);
  return log;
}

// ═══════════════════════════════════════════════════════════════

describe("brain.listRuns", () => {
  test("返回分页的 brain-run 日志 + 关联学生 nickname", async () => {
    users.push({ id: "student1", nickname: "小明", username: "xiaoming", role: "STUDENT" });
    seedBrainRun({ target: "student1" });
    seedBrainRun({ target: "student1" });

    const caller = getCaller();
    const res = await caller.brain.listRuns({ page: 1, pageSize: 20, skippedOnly: false });

    expect(res.total).toBe(2);
    expect(res.items[0].student?.nickname).toBe("小明");
    expect(res.items[0].agentsLaunched).toHaveLength(1);
  });

  test("skippedOnly=true 在 SQL 层过滤（total 反映过滤后总数，分页正确）", async () => {
    users.push({ id: "student1", nickname: "小明", username: "xiaoming", role: "STUDENT" });
    // 1 skipped (launched empty + skipped non-empty)
    seedBrainRun({}, { agentsLaunched: [], skipped: [{ jobName: "intervention", reason: "cooldown" }] });
    // 5 non-skipped (all have launched agents)
    for (let i = 0; i < 5; i++) {
      seedBrainRun({}, { agentsLaunched: [{ jobName: "intervention-planning", reason: "x" }], skipped: [] });
    }

    const caller = getCaller();
    const res = await caller.brain.listRuns({ page: 1, pageSize: 20, skippedOnly: true });

    // 关键：total 应是 1（过滤后真实总数），而不是 6（AdminLog 总数）
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].isSkipped).toBe(true);
  });

  test("skippedOnly=true 分页正确：当 skipped 稀疏时第一页仍能拿到", async () => {
    // 模拟真实场景：大量非 skipped 在前，一个 skipped 在 pageSize 之外
    users.push({ id: "s1", nickname: "x", username: "x", role: "STUDENT" });
    // 25 launched (non-skipped)
    for (let i = 0; i < 25; i++) {
      seedBrainRun(
        { createdAt: new Date(Date.now() - i * 1000) },
        { agentsLaunched: [{ jobName: "a", reason: "x" }], skipped: [] },
      );
    }
    // 1 skipped (older)
    seedBrainRun(
      { createdAt: new Date(Date.now() - 30000) },
      { agentsLaunched: [], skipped: [{ jobName: "b", reason: "c" }] },
    );

    const caller = getCaller();
    const res = await caller.brain.listRuns({ page: 1, pageSize: 20, skippedOnly: true });

    // 旧实现（JS 层过滤）会返回空，因为前 20 条全是非 skipped
    expect(res.total).toBe(1);
    expect(res.items).toHaveLength(1);
  });

  test("studentId filter 生效", async () => {
    users.push({ id: "s1", nickname: "A", username: "a", role: "STUDENT" });
    users.push({ id: "s2", nickname: "B", username: "b", role: "STUDENT" });
    seedBrainRun({ target: "s1" });
    seedBrainRun({ target: "s2" });

    const caller = getCaller();
    const res = await caller.brain.listRuns({
      studentId: "s1",
      page: 1,
      pageSize: 20,
      skippedOnly: false,
    });

    expect(res.total).toBe(1);
    expect(res.items[0].studentId).toBe("s1");
  });
});

describe("brain.studentStatus", () => {
  test("返回最近 5 次 run + cooldown + brainSchedule", async () => {
    users.push({ id: "student1", nickname: "小明", username: "xm", role: "STUDENT" });
    for (let i = 0; i < 7; i++) {
      seedBrainRun({ target: "student1", createdAt: new Date(Date.now() - i * 3600000) });
    }
    redisTtlMock = async () => 3600; // cooldown active

    const caller = getCaller();
    const res = await caller.brain.studentStatus({ studentId: "student1" });

    expect(res.student.nickname).toBe("小明");
    expect(res.recentRuns).toHaveLength(5); // cap 5
    expect(res.cooldownSeconds).toBe(3600);
    expect(res.brainSchedule).not.toBeNull();
    expect(res.brainSchedule?.pattern).toMatch(/\*/);
  });

  test("cooldownSeconds 为 null 当 key 不存在（TTL=-2）", async () => {
    users.push({ id: "student1", nickname: "小明", username: "xm", role: "STUDENT" });
    redisTtlMock = async () => -2;

    const caller = getCaller();
    const res = await caller.brain.studentStatus({ studentId: "student1" });

    expect(res.cooldownSeconds).toBeNull();
  });

  test("非学生角色 NOT_FOUND", async () => {
    users.push({ id: "a1", nickname: "Admin", username: "adm", role: "ADMIN" });
    const caller = getCaller();
    await expect(caller.brain.studentStatus({ studentId: "a1" })).rejects.toThrow();
  });
});

describe("brain.stats", () => {
  test("聚合最近 N 天：总运行 / 平均耗时 / agent 分布 / skipped top", async () => {
    users.push({ id: "s1", nickname: "A", username: "a", role: "STUDENT" });
    seedBrainRun(
      { target: "s1" },
      {
        durationMs: 1000,
        agentsLaunched: [
          { jobName: "intervention-planning", reason: "x" },
          { jobName: "mastery-evaluation", reason: "y" },
        ],
        skipped: [],
      },
    );
    seedBrainRun(
      { target: "s1" },
      {
        durationMs: 3000,
        agentsLaunched: [{ jobName: "intervention-planning", reason: "x" }],
        skipped: [{ jobName: "intervention", reason: "cooldown" }],
      },
    );

    const caller = getCaller();
    const res = await caller.brain.stats({ days: 7 });

    expect(res.totalRuns).toBe(2);
    expect(res.uniqueStudents).toBe(1);
    expect(res.avgDurationMs).toBe(2000);
    const intervention = res.agentDistribution.find((a) => a.agentName === "intervention-planning");
    expect(intervention?.count).toBe(2);
    expect(res.topSkippedReasons[0].reason).toContain("cooldown");
  });

  test("无数据返回零值", async () => {
    const caller = getCaller();
    const res = await caller.brain.stats({ days: 7 });

    expect(res.totalRuns).toBe(0);
    expect(res.avgDurationMs).toBe(0);
    expect(res.agentDistribution).toHaveLength(0);
  });
});

describe("brain RBAC", () => {
  const studentSession = { userId: "s1", role: "STUDENT", grade: null, locale: "zh" };

  test("STUDENT 不能调用 listRuns", async () => {
    const caller = getCaller(studentSession);
    await expect(
      caller.brain.listRuns({ page: 1, pageSize: 20, skippedOnly: false }),
    ).rejects.toThrow();
  });

  test("STUDENT 不能调用 stats", async () => {
    const caller = getCaller(studentSession);
    await expect(caller.brain.stats({ days: 7 })).rejects.toThrow();
  });
});
