/**
 * Unit Tests: Student Memory Layer
 *
 * Verifies:
 *   - Mastery state machine: legal/illegal transitions
 *   - StudentMemoryImpl: state updates, optimistic locking, intervention logging
 *   - Review scheduling
 *
 * Uses a minimal mock of PrismaClient (no real DB needed).
 *
 * See: docs/adr/010-student-memory-layer.md
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  MASTERY_TRANSITIONS,
  InvalidTransitionError,
  OptimisticLockError,
  StudentMemoryImpl,
} from "@/lib/domain/memory";
import type { MasteryStatus, MasteryTransition } from "@/lib/domain/memory";

// ─── State Machine (pure) ───────────────────────

describe("MASTERY_TRANSITIONS", () => {
  test("NEW_ERROR → CORRECTED is allowed", () => {
    expect(MASTERY_TRANSITIONS.NEW_ERROR.has("CORRECTED")).toBe(true);
  });

  test("NEW_ERROR → REVIEWING is forbidden", () => {
    expect(MASTERY_TRANSITIONS.NEW_ERROR.has("REVIEWING")).toBe(false);
  });

  test("NEW_ERROR → MASTERED is forbidden", () => {
    expect(MASTERY_TRANSITIONS.NEW_ERROR.has("MASTERED")).toBe(false);
  });

  test("CORRECTED → REVIEWING is allowed", () => {
    expect(MASTERY_TRANSITIONS.CORRECTED.has("REVIEWING")).toBe(true);
  });

  test("CORRECTED → MASTERED is forbidden", () => {
    expect(MASTERY_TRANSITIONS.CORRECTED.has("MASTERED")).toBe(false);
  });

  test("REVIEWING → MASTERED is allowed", () => {
    expect(MASTERY_TRANSITIONS.REVIEWING.has("MASTERED")).toBe(true);
  });

  test("REVIEWING → REGRESSED is allowed", () => {
    expect(MASTERY_TRANSITIONS.REVIEWING.has("REGRESSED")).toBe(true);
  });

  test("MASTERED → REGRESSED is allowed", () => {
    expect(MASTERY_TRANSITIONS.MASTERED.has("REGRESSED")).toBe(true);
  });

  test("REGRESSED → REVIEWING is allowed", () => {
    expect(MASTERY_TRANSITIONS.REGRESSED.has("REVIEWING")).toBe(true);
  });

  test("no status can transition to NEW_ERROR", () => {
    for (const [, allowed] of Object.entries(MASTERY_TRANSITIONS)) {
      expect(allowed.has("NEW_ERROR")).toBe(false);
    }
  });

  test("full legal path: NEW_ERROR → CORRECTED → REVIEWING → MASTERED", () => {
    const path: MasteryStatus[] = [
      "NEW_ERROR",
      "CORRECTED",
      "REVIEWING",
      "MASTERED",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(MASTERY_TRANSITIONS[path[i]!].has(path[i + 1]!)).toBe(true);
    }
  });

  test("regression cycle: MASTERED → REGRESSED → REVIEWING → MASTERED", () => {
    const path: MasteryStatus[] = [
      "MASTERED",
      "REGRESSED",
      "REVIEWING",
      "MASTERED",
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(MASTERY_TRANSITIONS[path[i]!].has(path[i + 1]!)).toBe(true);
    }
  });
});

describe("InvalidTransitionError", () => {
  test("contains from/to in message", () => {
    const err = new InvalidTransitionError("NEW_ERROR", "MASTERED");
    expect(err.message).toContain("NEW_ERROR");
    expect(err.message).toContain("MASTERED");
    expect(err.name).toBe("InvalidTransitionError");
    expect(err.from).toBe("NEW_ERROR");
    expect(err.to).toBe("MASTERED");
  });

  test("lists allowed transitions", () => {
    const err = new InvalidTransitionError("NEW_ERROR", "REVIEWING");
    expect(err.message).toContain("CORRECTED");
  });
});

describe("OptimisticLockError", () => {
  test("contains id and version", () => {
    const err = new OptimisticLockError("abc123", 3);
    expect(err.message).toContain("abc123");
    expect(err.message).toContain("3");
    expect(err.name).toBe("OptimisticLockError");
  });
});

// ─── Mock Prisma ────────────────────────────────

function createMockMasteryRow(overrides: Partial<{
  id: string;
  studentId: string;
  knowledgePointId: string;
  status: string;
  totalAttempts: number;
  correctAttempts: number;
  lastAttemptAt: Date | null;
  masteredAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: "mastery-1",
    studentId: "student-1",
    knowledgePointId: "kp-1",
    status: "NEW_ERROR",
    totalAttempts: 1,
    correctAttempts: 0,
    lastAttemptAt: null,
    masteredAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockPrisma() {
  return {
    masteryState: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      create: vi.fn(),
    },
    reviewSchedule: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
    },
    interventionHistory: {
      create: vi.fn().mockResolvedValue({
        id: "int-1",
        type: "REVIEW",
        content: {},
        agentId: null,
        skillId: null,
        createdAt: new Date(),
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

// ─── StudentMemoryImpl ──────────────────────────

describe("StudentMemoryImpl", () => {
  let mockDb: ReturnType<typeof createMockPrisma>;
  let memory: StudentMemoryImpl;

  beforeEach(() => {
    mockDb = createMockPrisma();
    memory = new StudentMemoryImpl(mockDb as never);
  });

  // ── getMasteryState ──

  describe("getMasteryState", () => {
    test("returns null when not found", async () => {
      mockDb.masteryState.findUnique.mockResolvedValue(null);
      const result = await memory.getMasteryState("s1", "kp1");
      expect(result).toBeNull();
    });

    test("returns view when found", async () => {
      const row = createMockMasteryRow();
      mockDb.masteryState.findUnique.mockResolvedValue(row);
      const result = await memory.getMasteryState("student-1", "kp-1");
      expect(result).toEqual({
        id: "mastery-1",
        studentId: "student-1",
        knowledgePointId: "kp-1",
        status: "NEW_ERROR",
        totalAttempts: 1,
        correctAttempts: 0,
        lastAttemptAt: null,
        masteredAt: null,
        version: 1,
      });
    });
  });

  // ── updateMasteryState ──

  describe("updateMasteryState", () => {
    test("legal transition NEW_ERROR → CORRECTED succeeds", async () => {
      const row = createMockMasteryRow({ status: "NEW_ERROR", version: 1 });
      const updatedRow = createMockMasteryRow({
        status: "CORRECTED",
        version: 2,
      });

      // First findUnique: load current, Second: re-fetch after update
      mockDb.masteryState.findUnique
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(updatedRow);
      mockDb.masteryState.updateMany.mockResolvedValue({ count: 1 });

      const transition: MasteryTransition = {
        from: "NEW_ERROR",
        to: "CORRECTED",
        reason: "Student corrected answer",
      };

      const result = await memory.updateMasteryState(
        "student-1",
        "kp-1",
        transition,
      );
      expect(result.status).toBe("CORRECTED");
      expect(result.version).toBe(2);

      // Verify optimistic lock WHERE clause
      expect(mockDb.masteryState.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "mastery-1", version: 1 },
        }),
      );
    });

    test("illegal transition NEW_ERROR → MASTERED throws InvalidTransitionError", async () => {
      const transition: MasteryTransition = {
        from: "NEW_ERROR",
        to: "MASTERED",
        reason: "skip",
      };

      await expect(
        memory.updateMasteryState("s1", "kp1", transition),
      ).rejects.toThrow(InvalidTransitionError);
    });

    test("illegal transition CORRECTED → MASTERED throws", async () => {
      const transition: MasteryTransition = {
        from: "CORRECTED",
        to: "MASTERED",
        reason: "skip",
      };

      await expect(
        memory.updateMasteryState("s1", "kp1", transition),
      ).rejects.toThrow(InvalidTransitionError);
    });

    test("mismatched current state throws InvalidTransitionError", async () => {
      // Current is CORRECTED, but transition says from=NEW_ERROR
      const row = createMockMasteryRow({ status: "CORRECTED" });
      mockDb.masteryState.findUnique.mockResolvedValue(row);

      const transition: MasteryTransition = {
        from: "NEW_ERROR",
        to: "CORRECTED",
        reason: "wrong from state",
      };

      await expect(
        memory.updateMasteryState("student-1", "kp-1", transition),
      ).rejects.toThrow(InvalidTransitionError);
    });

    test("throws when MasteryState not found", async () => {
      mockDb.masteryState.findUnique.mockResolvedValue(null);

      const transition: MasteryTransition = {
        from: "NEW_ERROR",
        to: "CORRECTED",
        reason: "test",
      };

      await expect(
        memory.updateMasteryState("s1", "kp1", transition),
      ).rejects.toThrow("not found");
    });

    test("optimistic lock conflict throws OptimisticLockError", async () => {
      const row = createMockMasteryRow({ status: "NEW_ERROR", version: 5 });
      mockDb.masteryState.findUnique.mockResolvedValue(row);
      mockDb.masteryState.updateMany.mockResolvedValue({ count: 0 }); // conflict

      const transition: MasteryTransition = {
        from: "NEW_ERROR",
        to: "CORRECTED",
        reason: "concurrent update",
      };

      await expect(
        memory.updateMasteryState("student-1", "kp-1", transition),
      ).rejects.toThrow(OptimisticLockError);
    });

    test("transition to MASTERED sets masteredAt", async () => {
      const row = createMockMasteryRow({
        status: "REVIEWING",
        version: 3,
      });
      const updatedRow = createMockMasteryRow({
        status: "MASTERED",
        version: 4,
        masteredAt: new Date(),
      });

      mockDb.masteryState.findUnique
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(updatedRow);

      const transition: MasteryTransition = {
        from: "REVIEWING",
        to: "MASTERED",
        reason: "3 consecutive correct",
      };

      const result = await memory.updateMasteryState(
        "student-1",
        "kp-1",
        transition,
      );
      expect(result.status).toBe("MASTERED");
      expect(result.masteredAt).not.toBeNull();

      // Check masteredAt was set in update data
      const updateCall = mockDb.masteryState.updateMany.mock.calls[0]![0];
      expect(updateCall.data.masteredAt).toBeInstanceOf(Date);
    });

    test("transition to REGRESSED clears masteredAt", async () => {
      const row = createMockMasteryRow({ status: "MASTERED", version: 4 });
      const updatedRow = createMockMasteryRow({
        status: "REGRESSED",
        version: 5,
        masteredAt: null,
      });

      mockDb.masteryState.findUnique
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(updatedRow);

      const transition: MasteryTransition = {
        from: "MASTERED",
        to: "REGRESSED",
        reason: "New error on same KP",
      };

      const result = await memory.updateMasteryState(
        "student-1",
        "kp-1",
        transition,
      );
      expect(result.masteredAt).toBeNull();

      const updateCall = mockDb.masteryState.updateMany.mock.calls[0]![0];
      expect(updateCall.data.masteredAt).toBeNull();
    });

    test("logs intervention on successful transition", async () => {
      const row = createMockMasteryRow({ status: "NEW_ERROR" });
      const updatedRow = createMockMasteryRow({ status: "CORRECTED", version: 2 });

      mockDb.masteryState.findUnique
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce(updatedRow);

      const transition: MasteryTransition = {
        from: "NEW_ERROR",
        to: "CORRECTED",
        reason: "Student answered correctly",
      };

      await memory.updateMasteryState("student-1", "kp-1", transition);

      expect(mockDb.interventionHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: "student-1",
          knowledgePointId: "kp-1",
          type: "REVIEW",
          content: expect.objectContaining({
            transition: "NEW_ERROR → CORRECTED",
            reason: "Student answered correctly",
          }),
        }),
      });
    });
  });

  // ── getWeakPoints ──

  describe("getWeakPoints", () => {
    test("queries weak statuses (NEW_ERROR, CORRECTED, REGRESSED)", async () => {
      await memory.getWeakPoints("s1");
      expect(mockDb.masteryState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: "s1",
            status: { in: ["NEW_ERROR", "CORRECTED", "REGRESSED"] },
          }),
        }),
      );
    });

    test("respects limit option", async () => {
      await memory.getWeakPoints("s1", { limit: 10 });
      expect(mockDb.masteryState.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10 }),
      );
    });
  });

  // ── scheduleReview ──

  describe("scheduleReview", () => {
    test("upserts review schedule", async () => {
      const schedule = {
        id: "rev-1",
        studentId: "s1",
        knowledgePointId: "kp-1",
        nextReviewAt: new Date(),
        intervalDays: 3,
        easeFactor: 2.5,
        consecutiveCorrect: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDb.reviewSchedule.upsert.mockResolvedValue(schedule);

      const result = await memory.scheduleReview("s1", "kp-1", 3);
      expect(result.intervalDays).toBe(3);
      expect(mockDb.reviewSchedule.upsert).toHaveBeenCalled();
    });
  });

  // ── getOverdueReviews ──

  describe("getOverdueReviews", () => {
    test("queries reviews with nextReviewAt <= now", async () => {
      await memory.getOverdueReviews("s1");
      expect(mockDb.reviewSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId: "s1",
            nextReviewAt: { lte: expect.any(Date) },
          }),
        }),
      );
    });
  });

  // ── logIntervention ──

  describe("logIntervention", () => {
    test("creates intervention record", async () => {
      await memory.logIntervention(
        "s1",
        "kp-1",
        "HINT",
        { hint: "try factoring" },
        { agentId: "homework-checker", skillId: "math-hint" },
      );

      expect(mockDb.interventionHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          studentId: "s1",
          knowledgePointId: "kp-1",
          type: "HINT",
          agentId: "homework-checker",
          skillId: "math-hint",
        }),
      });
    });

    test("defaults agentId/skillId to null", async () => {
      await memory.logIntervention("s1", "kp-1", "DIAGNOSIS", {});

      expect(mockDb.interventionHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: null,
          skillId: null,
        }),
      });
    });
  });

  // ── getInterventionHistory ──

  describe("getInterventionHistory", () => {
    test("returns mapped records", async () => {
      mockDb.interventionHistory.findMany.mockResolvedValue([
        {
          id: "int-1",
          type: "HINT",
          content: { hint: "try again" },
          agentId: "checker",
          skillId: null,
          createdAt: new Date("2026-04-10"),
        },
      ]);

      const result = await memory.getInterventionHistory("s1", "kp-1");
      expect(result).toHaveLength(1);
      expect(result[0]!.type).toBe("HINT");
      expect(result[0]!.agentId).toBe("checker");
    });
  });

  // ── Full transition path ──

  describe("full lifecycle: NEW_ERROR → CORRECTED → REVIEWING → MASTERED → REGRESSED → REVIEWING", () => {
    const path: Array<{ from: MasteryStatus; to: MasteryStatus }> = [
      { from: "NEW_ERROR", to: "CORRECTED" },
      { from: "CORRECTED", to: "REVIEWING" },
      { from: "REVIEWING", to: "MASTERED" },
      { from: "MASTERED", to: "REGRESSED" },
      { from: "REGRESSED", to: "REVIEWING" },
    ];

    for (const { from, to } of path) {
      test(`${from} → ${to} is accepted`, async () => {
        const row = createMockMasteryRow({ status: from, version: 1 });
        const updated = createMockMasteryRow({ status: to, version: 2 });

        mockDb.masteryState.findUnique
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce(updated);
        mockDb.masteryState.updateMany.mockResolvedValue({ count: 1 });

        const result = await memory.updateMasteryState("s1", "kp-1", {
          from,
          to,
          reason: "test lifecycle",
        });
        expect(result.status).toBe(to);
      });
    }
  });

  // ── Forbidden transitions ──

  describe("forbidden transitions are rejected", () => {
    const forbidden: Array<{ from: MasteryStatus; to: MasteryStatus }> = [
      { from: "NEW_ERROR", to: "REVIEWING" },
      { from: "NEW_ERROR", to: "MASTERED" },
      { from: "NEW_ERROR", to: "REGRESSED" },
      { from: "CORRECTED", to: "MASTERED" },
      { from: "CORRECTED", to: "NEW_ERROR" },
      { from: "REVIEWING", to: "NEW_ERROR" },
      { from: "REVIEWING", to: "CORRECTED" },
      { from: "MASTERED", to: "NEW_ERROR" },
      { from: "MASTERED", to: "CORRECTED" },
      { from: "MASTERED", to: "REVIEWING" },
      { from: "REGRESSED", to: "NEW_ERROR" },
      { from: "REGRESSED", to: "MASTERED" },
    ];

    for (const { from, to } of forbidden) {
      test(`${from} → ${to} throws InvalidTransitionError`, async () => {
        await expect(
          memory.updateMasteryState("s1", "kp-1", {
            from,
            to,
            reason: "should fail",
          }),
        ).rejects.toThrow(InvalidTransitionError);
      });
    }
  });
});
