/**
 * Unit Tests: Parent Learning Control (tRPC)
 *
 * Covers setLearningControl + getLearningControl + recentSettingLogs:
 *   - RBAC: PARENT role required; non-family student forbidden
 *   - HH:MM regex validation (both bounds)
 *   - Upsert create branch inserts sane defaults (maxHelpLevel = 2)
 *   - Upsert update branch preserves other fields
 *   - AdminLog entry written on every save (adminId = parentId)
 *   - recentSettingLogs filters by adminId + target + action
 *
 * See: docs/user-stories/parent-learning-control.md (US-054)
 */
import { describe, test, expect, beforeEach } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

const createCaller = createCallerFactory(appRouter);

const parentSession = {
  userId: "parent1",
  role: "PARENT",
  grade: null,
  locale: "zh",
};
const studentSession = {
  userId: "student1",
  role: "STUDENT",
  grade: "PRIMARY_3",
  locale: "zh",
};

let db: MockDb;

function seedFamily() {
  db._families.push({
    id: "fam1",
    name: "Test Family",
    inviteCode: null,
    inviteCodeExpiresAt: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  db._familyMembers.push(
    { id: "fm1", userId: "parent1", familyId: "fam1", role: "OWNER", joinedAt: new Date() },
    { id: "fm2", userId: "student1", familyId: "fam1", role: "MEMBER", joinedAt: new Date() },
  );
}

beforeEach(() => {
  db = createMockDb();
});

describe("parent.setLearningControl", () => {
  test("rejects STUDENT role", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.parent.setLearningControl({
        studentId: "student1",
        maxDailyTasks: 5,
        learningTimeStart: null,
        learningTimeEnd: null,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  test("rejects parent without family relationship", async () => {
    const caller = createCaller(createMockContext(db, parentSession));
    await expect(
      caller.parent.setLearningControl({
        studentId: "student1",
        maxDailyTasks: 5,
        learningTimeStart: null,
        learningTimeEnd: null,
      }),
    ).rejects.toThrow("FORBIDDEN");
  });

  test("validates HH:MM format (rejects invalid)", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    await expect(
      caller.parent.setLearningControl({
        studentId: "student1",
        maxDailyTasks: 5,
        learningTimeStart: "25:00",
        learningTimeEnd: "07:00",
      }),
    ).rejects.toThrow();
  });

  test("validates maxDailyTasks upper bound", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    await expect(
      caller.parent.setLearningControl({
        studentId: "student1",
        maxDailyTasks: 21,
        learningTimeStart: null,
        learningTimeEnd: null,
      }),
    ).rejects.toThrow();
  });

  test("creates config with default maxHelpLevel = 2 on first save", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    await caller.parent.setLearningControl({
      studentId: "student1",
      maxDailyTasks: 8,
      learningTimeStart: "18:00",
      learningTimeEnd: "21:00",
    });

    expect(db._parentStudentConfigs).toHaveLength(1);
    const cfg = db._parentStudentConfigs[0];
    expect(cfg.parentId).toBe("parent1");
    expect(cfg.studentId).toBe("student1");
    expect(cfg.maxHelpLevel).toBe(2);
    expect(cfg.maxDailyTasks).toBe(8);
    expect(cfg.learningTimeStart).toBe("18:00");
    expect(cfg.learningTimeEnd).toBe("21:00");
  });

  test("update branch preserves maxHelpLevel", async () => {
    seedFamily();
    // Seed existing config with a non-default maxHelpLevel
    db._parentStudentConfigs.push({
      id: "psc-seed",
      parentId: "parent1",
      studentId: "student1",
      maxHelpLevel: 3,
      maxDailyTasks: 10,
      learningTimeStart: null,
      learningTimeEnd: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, parentSession));
    await caller.parent.setLearningControl({
      studentId: "student1",
      maxDailyTasks: 2,
      learningTimeStart: null,
      learningTimeEnd: null,
    });

    const cfg = db._parentStudentConfigs[0];
    expect(cfg.maxHelpLevel).toBe(3); // preserved
    expect(cfg.maxDailyTasks).toBe(2);
  });

  test("writes AdminLog entry with adminId = parentId, action = parent-setting", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    await caller.parent.setLearningControl({
      studentId: "student1",
      maxDailyTasks: 5,
      learningTimeStart: "19:00",
      learningTimeEnd: "20:30",
    });

    expect(db._adminLogs).toHaveLength(1);
    const log = db._adminLogs[0];
    expect(log.adminId).toBe("parent1");
    expect(log.action).toBe("parent-setting");
    expect(log.target).toBe("student1");
    expect(log.details).toMatchObject({
      maxDailyTasks: 5,
      learningTimeStart: "19:00",
      learningTimeEnd: "20:30",
    });
  });

  test("accepts both bounds null (no restriction)", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.setLearningControl({
      studentId: "student1",
      maxDailyTasks: 10,
      learningTimeStart: null,
      learningTimeEnd: null,
    });
    expect(result.learningTimeStart).toBeNull();
    expect(result.learningTimeEnd).toBeNull();
  });
});

describe("parent.getLearningControl", () => {
  test("returns defaults when no config exists", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.getLearningControl({ studentId: "student1" });
    expect(result).toEqual({
      maxDailyTasks: 10,
      learningTimeStart: null,
      learningTimeEnd: null,
    });
  });

  test("returns stored config", async () => {
    seedFamily();
    db._parentStudentConfigs.push({
      id: "psc1",
      parentId: "parent1",
      studentId: "student1",
      maxHelpLevel: 2,
      maxDailyTasks: 7,
      learningTimeStart: "08:00",
      learningTimeEnd: "17:00",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.getLearningControl({ studentId: "student1" });
    expect(result).toEqual({
      maxDailyTasks: 7,
      learningTimeStart: "08:00",
      learningTimeEnd: "17:00",
    });
  });

  test("rejects non-PARENT role", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.parent.getLearningControl({ studentId: "student1" }),
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("parent.recentSettingLogs", () => {
  test("returns only logs for this parent + this student + parent-setting action", async () => {
    seedFamily();
    // This parent's log for our student
    db._adminLogs.push({
      id: "l1",
      adminId: "parent1",
      action: "parent-setting",
      target: "student1",
      details: { maxDailyTasks: 5 },
      createdAt: new Date("2026-04-10T10:00:00Z"),
    });
    // Another parent's log (same student) — must not leak
    db._adminLogs.push({
      id: "l2",
      adminId: "otherparent",
      action: "parent-setting",
      target: "student1",
      details: { maxDailyTasks: 3 },
      createdAt: new Date("2026-04-11T10:00:00Z"),
    });
    // Different action — must not match
    db._adminLogs.push({
      id: "l3",
      adminId: "parent1",
      action: "brain-run",
      target: "student1",
      details: {},
      createdAt: new Date("2026-04-12T10:00:00Z"),
    });

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.recentSettingLogs({
      studentId: "student1",
      limit: 10,
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("l1");
  });

  test("sorts by createdAt desc", async () => {
    seedFamily();
    db._adminLogs.push(
      {
        id: "l1",
        adminId: "parent1",
        action: "parent-setting",
        target: "student1",
        details: { maxDailyTasks: 5 },
        createdAt: new Date("2026-04-10T10:00:00Z"),
      },
      {
        id: "l2",
        adminId: "parent1",
        action: "parent-setting",
        target: "student1",
        details: { maxDailyTasks: 7 },
        createdAt: new Date("2026-04-12T10:00:00Z"),
      },
    );

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.recentSettingLogs({
      studentId: "student1",
      limit: 10,
    });
    expect(result.map((l) => l.id)).toEqual(["l2", "l1"]);
  });

  test("respects limit", async () => {
    seedFamily();
    for (let i = 0; i < 5; i++) {
      db._adminLogs.push({
        id: `l${i}`,
        adminId: "parent1",
        action: "parent-setting",
        target: "student1",
        details: { maxDailyTasks: i },
        createdAt: new Date(2026, 3, 10 + i),
      });
    }
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.parent.recentSettingLogs({
      studentId: "student1",
      limit: 2,
    });
    expect(result).toHaveLength(2);
  });
});
