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

function buildDb() {
  return {
    adminLog: {
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
        // Sort by createdAt desc (default)
        res = res.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        if (skip) res = res.slice(skip as number);
        if (take) res = res.slice(0, take as number);
        return res;
      }),
      count: vi.fn(async ({ where }: Record<string, unknown>) => {
        return logs.filter((l) => {
          const w = where as Record<string, unknown>;
          if (!w) return true;
          if (w.action && w.action !== l.action) return false;
          if (w.target && w.target !== l.target) return false;
          return true;
        }).length;
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

  test("skippedOnly=true 过滤掉 launched 有值的", async () => {
    users.push({ id: "student1", nickname: "小明", username: "xiaoming", role: "STUDENT" });
    seedBrainRun({}, { agentsLaunched: [], skipped: [{ jobName: "intervention", reason: "cooldown" }] });
    seedBrainRun({}, { agentsLaunched: [{ jobName: "intervention-planning", reason: "x" }], skipped: [] });

    const caller = getCaller();
    const res = await caller.brain.listRuns({ page: 1, pageSize: 20, skippedOnly: true });

    // 只保留 skipped 的
    expect(res.items.every((i) => i.isSkipped)).toBe(true);
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
