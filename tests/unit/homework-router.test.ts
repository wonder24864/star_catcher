/**
 * Unit Tests: Homework Router
 * Tests tRPC homework procedures with mocked DB and storage.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

vi.mock("@/lib/storage", () => import("../helpers/mock-storage"));
import { storageCalls, resetStorageCalls } from "../helpers/mock-storage";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;
const studentSession = { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" };
const parentSession = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };

function seedFamily() {
  db._families.push({
    id: "family1", name: "Test Family", inviteCode: null,
    inviteCodeExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
  });
  db._familyMembers.push(
    { id: "fm1", userId: "parent1", familyId: "family1", role: "OWNER", joinedAt: new Date() },
    { id: "fm2", userId: "student1", familyId: "family1", role: "MEMBER", joinedAt: new Date() },
  );
}

function seedSession(overrides?: Partial<{ id: string; status: string; createdBy: string; studentId: string }>) {
  const session = {
    id: overrides?.id ?? "hw-session-1",
    studentId: overrides?.studentId ?? "student1",
    createdBy: overrides?.createdBy ?? "student1",
    subject: null, contentType: null, grade: null, title: null,
    status: overrides?.status ?? "CREATED",
    finalScore: null, totalRounds: 0,
    createdAt: new Date(), updatedAt: new Date(),
  };
  db._homeworkSessions.push(session);
  return session;
}

function seedImage(sessionId: string, objectKey: string, sortOrder: number = 0) {
  const image = {
    id: `img-${db._homeworkImages.length + 1}`,
    homeworkSessionId: sessionId,
    imageUrl: objectKey,
    originalFilename: `img${sortOrder}.jpg`,
    sortOrder,
    exifRotation: 0,
    privacyStripped: true,
    createdAt: new Date(),
  };
  db._homeworkImages.push(image);
  return image;
}

beforeEach(() => {
  db = createMockDb();
  resetStorageCalls();
});

describe("homework.createSession", () => {
  test("student creates session for themselves", async () => {
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.createSession({ studentId: "student1" });

    expect(result.id).toBeTruthy();
    expect(db._homeworkSessions).toHaveLength(1);
    expect(db._homeworkSessions[0].studentId).toBe("student1");
    expect(db._homeworkSessions[0].createdBy).toBe("student1");
    expect(db._homeworkSessions[0].status).toBe("CREATED");
  });

  test("rejects unauthenticated users", async () => {
    const caller = createCaller(createMockContext(db, null));
    await expect(
      caller.homework.createSession({ studentId: "student1" })
    ).rejects.toThrow("UNAUTHORIZED");
  });

  test("parent creates session for family student", async () => {
    seedFamily();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.homework.createSession({ studentId: "student1" });

    expect(result.id).toBeTruthy();
    expect(db._homeworkSessions[0].createdBy).toBe("parent1");
    expect(db._homeworkSessions[0].studentId).toBe("student1");
  });

  test("parent cannot create session for non-family student", async () => {
    // No family relationship
    const caller = createCaller(createMockContext(db, parentSession));
    await expect(
      caller.homework.createSession({ studentId: "student1" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("student cannot create session for another student", async () => {
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.createSession({ studentId: "other-student" })
    ).rejects.toThrow("FORBIDDEN");
  });
});

describe("homework.getSession", () => {
  test("returns session with images ordered by sortOrder", async () => {
    seedSession();
    seedImage("hw-session-1", "img2.jpg", 2);
    seedImage("hw-session-1", "img0.jpg", 0);
    seedImage("hw-session-1", "img1.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.getSession({ sessionId: "hw-session-1" });

    expect(result.id).toBe("hw-session-1");
    expect(result.images).toHaveLength(3);
    expect(result.images[0].sortOrder).toBe(0);
    expect(result.images[1].sortOrder).toBe(1);
    expect(result.images[2].sortOrder).toBe(2);
  });

  test("rejects non-owner access", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.getSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("parent can view family student session", async () => {
    seedFamily();
    seedSession();
    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.homework.getSession({ sessionId: "hw-session-1" });
    expect(result.id).toBe("hw-session-1");
  });
});

describe("homework.listSessions", () => {
  test("returns sessions for student in desc order", async () => {
    const s1 = seedSession({ id: "s1" });
    s1.createdAt = new Date("2026-01-01");
    const s2 = seedSession({ id: "s2" });
    s2.createdAt = new Date("2026-01-02");

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.listSessions({ studentId: "student1" });

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("s2"); // Newer first
    expect(result[1].id).toBe("s1");
  });

  test("respects limit parameter", async () => {
    seedSession({ id: "s1" });
    seedSession({ id: "s2" });
    seedSession({ id: "s3" });

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.listSessions({ studentId: "student1", limit: 2 });
    expect(result).toHaveLength(2);
  });

  test("includes image count", async () => {
    seedSession();
    seedImage("hw-session-1", "a.jpg", 0);
    seedImage("hw-session-1", "b.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.listSessions({ studentId: "student1" });

    expect(result[0]._count.images).toBe(2);
  });
});

describe("homework.updateImageOrder", () => {
  test("updates sortOrder for each image", async () => {
    seedSession();
    const img1 = seedImage("hw-session-1", "a.jpg", 0);
    const img2 = seedImage("hw-session-1", "b.jpg", 1);
    const img3 = seedImage("hw-session-1", "c.jpg", 2);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.updateImageOrder({
      sessionId: "hw-session-1",
      imageIds: [img3.id, img1.id, img2.id], // Reversed order
    });

    expect(result.success).toBe(true);
    expect(db._homeworkImages.find((i) => i.id === img3.id)?.sortOrder).toBe(0);
    expect(db._homeworkImages.find((i) => i.id === img1.id)?.sortOrder).toBe(1);
    expect(db._homeworkImages.find((i) => i.id === img2.id)?.sortOrder).toBe(2);
  });

  test("rejects if session is not CREATED", async () => {
    seedSession({ status: "CHECKING" });

    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.updateImageOrder({
        sessionId: "hw-session-1",
        imageIds: ["img1"],
      })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });
});

describe("homework.deleteSession", () => {
  test("deletes session and all images from DB", async () => {
    seedSession();
    seedImage("hw-session-1", "a.jpg", 0);
    seedImage("hw-session-1", "b.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.homework.deleteSession({ sessionId: "hw-session-1" });

    expect(result.success).toBe(true);
    expect(db._homeworkSessions).toHaveLength(0);
    expect(db._homeworkImages).toHaveLength(0);
  });

  test("calls deleteObject for each image in MinIO", async () => {
    seedSession();
    seedImage("hw-session-1", "homework/s1/a.jpg", 0);
    seedImage("hw-session-1", "homework/s1/b.jpg", 1);

    const caller = createCaller(createMockContext(db, studentSession));
    await caller.homework.deleteSession({ sessionId: "hw-session-1" });

    expect(storageCalls.deletedObjects).toContain("homework/s1/a.jpg");
    expect(storageCalls.deletedObjects).toContain("homework/s1/b.jpg");
  });

  test("rejects if session is not CREATED", async () => {
    seedSession({ status: "COMPLETED" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.deleteSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.homework.deleteSession({ sessionId: "hw-session-1" })
    ).rejects.toThrow("FORBIDDEN");
  });
});
