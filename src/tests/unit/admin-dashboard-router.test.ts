/**
 * Unit Tests: admin.dashboard procedure (Sprint 24)
 *
 * Verifies dashboard aggregation query returns expected shape.
 */
import { describe, test, expect, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import type { Context } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);
const adminSession = { userId: "admin1", role: "ADMIN", grade: null, locale: "zh" };

const mockDb = {
  user: {
    groupBy: vi.fn().mockResolvedValue([
      { role: "STUDENT", _count: { id: 15 } },
      { role: "PARENT", _count: { id: 8 } },
      { role: "ADMIN", _count: { id: 2 } },
    ]),
  },
  errorQuestion: {
    count: vi.fn().mockResolvedValue(42),
  },
  homeworkSession: {
    count: vi.fn().mockResolvedValue(7),
  },
  masteryState: {
    count: vi.fn(),
  },
  adminLog: {
    findMany: vi.fn().mockResolvedValue([
      {
        id: "log1",
        action: "RESET_PASSWORD",
        target: "user1",
        createdAt: new Date("2026-04-16T10:00:00Z"),
        admin: { nickname: "Admin One" },
      },
    ]),
  },
};

// Wire up masteryState.count to return different values based on where
mockDb.masteryState.count
  .mockResolvedValueOnce(20) // total non-archived
  .mockResolvedValueOnce(14); // mastered count

function createCtx(): Context {
  const pino = require("pino");
  return {
    db: mockDb as unknown as Context["db"],
    session: adminSession,
    requestId: "test",
    log: pino({ level: "silent" }),
  } as Context;
}

describe("admin.dashboard", () => {
  test("returns aggregated dashboard stats", async () => {
    const caller = createCaller(createCtx());
    const result = await caller.admin.dashboard();

    expect(result.studentCount).toBe(15);
    expect(result.parentCount).toBe(8);
    expect(result.adminCount).toBe(2);
    expect(result.totalErrors).toBe(42);
    expect(result.weeklyActiveSessions).toBe(7);
    expect(result.avgMastery).toBe(70); // 14/20 * 100 = 70
    expect(result.recentLogs).toHaveLength(1);
    expect(result.recentLogs[0].action).toBe("RESET_PASSWORD");
  });

  test("handles zero mastery states gracefully", async () => {
    mockDb.masteryState.count
      .mockResolvedValueOnce(0) // total
      .mockResolvedValueOnce(0); // mastered

    const caller = createCaller(createCtx());
    const result = await caller.admin.dashboard();

    expect(result.avgMastery).toBe(0);
  });
});
