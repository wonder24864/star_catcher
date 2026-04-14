/**
 * Unit Tests: MemoryWriteInterceptor
 *
 * Verifies that the interceptor enforces memoryWriteManifest:
 * - Allowed methods pass through to inner handler
 * - Disallowed methods throw FORBIDDEN_MEMORY_WRITE
 * - Rejections log to AdminLog
 * - undefined manifest = allow all (backward compat)
 * - Empty array manifest = deny all
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { createMemoryWriteInterceptor } from "@/lib/domain/agent/memory-write-interceptor";

// Mock AdminLog
vi.mock("@/lib/domain/admin-log", () => ({
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}));

import { logAdminAction } from "@/lib/domain/admin-log";

const mockDb = {} as any;

describe("MemoryWriteInterceptor", () => {
  const innerHandler = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Allowed methods ──

  test("calls inner handler when method is in manifest", async () => {
    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "test-agent",
        manifest: ["logIntervention", "updateMasteryState"],
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    const params = { studentId: "s1", knowledgePointId: "kp1" };
    await intercepted("logIntervention", params);

    expect(innerHandler).toHaveBeenCalledWith("logIntervention", params);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // ── Disallowed methods ──

  test("throws FORBIDDEN_MEMORY_WRITE for method not in manifest", async () => {
    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "test-agent",
        manifest: ["logIntervention"],
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    await expect(
      intercepted("updateMasteryState", { studentId: "s1" }),
    ).rejects.toThrow("FORBIDDEN_MEMORY_WRITE");

    expect(innerHandler).not.toHaveBeenCalled();
  });

  test("logs rejection to AdminLog", async () => {
    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "diagnosis",
        manifest: ["logIntervention"],
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    await expect(
      intercepted("scheduleReview", { studentId: "s1" }),
    ).rejects.toThrow("FORBIDDEN_MEMORY_WRITE");

    expect(logAdminAction).toHaveBeenCalledWith(
      mockDb,
      "user-1",
      "memory-write-rejection",
      "diagnosis",
      expect.objectContaining({
        method: "scheduleReview",
        agentName: "diagnosis",
        studentId: "s1",
      }),
    );
  });

  // ── Empty manifest (deny all) ──

  test("denies all writes when manifest is empty array", async () => {
    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "question-understanding",
        manifest: [],
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    await expect(
      intercepted("logIntervention", { studentId: "s1" }),
    ).rejects.toThrow("FORBIDDEN_MEMORY_WRITE");

    expect(innerHandler).not.toHaveBeenCalled();
    expect(logAdminAction).toHaveBeenCalled();
  });

  // ── undefined manifest (backward compat) ──

  test("allows all writes when manifest is undefined", async () => {
    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "legacy-agent",
        manifest: undefined,
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    await intercepted("updateMasteryState", { studentId: "s1" });
    await intercepted("scheduleReview", { studentId: "s1" });
    await intercepted("logIntervention", { studentId: "s1" });

    expect(innerHandler).toHaveBeenCalledTimes(3);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  // ── AdminLog failure resilience ──

  test("still throws FORBIDDEN even if AdminLog fails", async () => {
    vi.mocked(logAdminAction).mockRejectedValueOnce(new Error("DB down"));

    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "test-agent",
        manifest: ["logIntervention"],
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    // logAdminAction is best-effort (wrapped in try/catch inside admin-log.ts),
    // but even if it somehow throws, the interceptor should still reject
    await expect(
      intercepted("scheduleReview", { studentId: "s1" }),
    ).rejects.toThrow("FORBIDDEN_MEMORY_WRITE");

    expect(innerHandler).not.toHaveBeenCalled();
  });

  // ── Error message content ──

  test("error message includes agent name and allowed methods", async () => {
    const intercepted = createMemoryWriteInterceptor(
      {
        agentName: "my-agent",
        manifest: ["logIntervention", "scheduleReview"],
        db: mockDb,
        userId: "user-1",
      },
      innerHandler,
    );

    await expect(
      intercepted("updateMasteryState", { studentId: "s1" }),
    ).rejects.toThrow(/my-agent/);

    await expect(
      intercepted("updateMasteryState", { studentId: "s1" }),
    ).rejects.toThrow(/logIntervention, scheduleReview/);
  });
});
