/**
 * Unit Tests: Upload Router
 * Tests tRPC upload procedures with mocked DB and storage.
 */
import { describe, test, expect, beforeEach, vi } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";
import { createMockDb, createMockContext, type MockDb } from "../helpers/mock-db";

// Mock storage module to avoid loading MinIO
vi.mock("@/lib/storage", () => import("../helpers/mock-storage"));

// Import mock storage for assertions
import { storageCalls, resetStorageCalls } from "../helpers/mock-storage";

const createCaller = createCallerFactory(appRouter);

let db: MockDb;
const studentSession = { userId: "student1", role: "STUDENT", grade: "PRIMARY_3", locale: "zh" };
const parentSession = { userId: "parent1", role: "PARENT", grade: null, locale: "zh" };

function seedSession(overrides?: Partial<{ status: string; createdBy: string; studentId: string }>) {
  const session = {
    id: "hw-session-1",
    studentId: overrides?.studentId ?? "student1",
    createdBy: overrides?.createdBy ?? "student1",
    subject: null,
    contentType: null,
    grade: null,
    title: null,
    status: overrides?.status ?? "CREATED",
    finalScore: null,
    totalRounds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  db._homeworkSessions.push(session);
  return session;
}

function seedImage(sessionId: string, objectKey: string) {
  const image = {
    id: `img-${db._homeworkImages.length + 1}`,
    homeworkSessionId: sessionId,
    imageUrl: objectKey,
    originalFilename: "test.jpg",
    sortOrder: db._homeworkImages.length,
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

describe("upload.getPresignedUploadUrl", () => {
  test("rejects unauthenticated requests", async () => {
    const caller = createCaller(createMockContext(db, null));
    await expect(
      caller.upload.getPresignedUploadUrl({
        sessionId: "hw-session-1",
        filename: "test.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      })
    ).rejects.toThrow("UNAUTHORIZED");
  });

  test("rejects if session does not exist", async () => {
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.getPresignedUploadUrl({
        sessionId: "nonexistent",
        filename: "test.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      })
    ).rejects.toThrow("SESSION_NOT_FOUND");
  });

  test("rejects if user does not own the session", async () => {
    seedSession({ createdBy: "other-user", studentId: "other-student" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.getPresignedUploadUrl({
        sessionId: "hw-session-1",
        filename: "test.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("rejects if session status is not CREATED", async () => {
    seedSession({ status: "RECOGNIZING" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.getPresignedUploadUrl({
        sessionId: "hw-session-1",
        filename: "test.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });

  test("rejects files exceeding size limit", async () => {
    seedSession();
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.getPresignedUploadUrl({
        sessionId: "hw-session-1",
        filename: "huge.jpg",
        contentType: "image/jpeg",
        fileSize: 21 * 1024 * 1024, // 21MB > 20MB
      })
    ).rejects.toThrow("FILE_TOO_LARGE");
  });

  test("rejects when image count >= 10", async () => {
    seedSession();
    for (let i = 0; i < 10; i++) {
      seedImage("hw-session-1", `homework/student1/hw-session-1/img${i}.jpg`);
    }
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.getPresignedUploadUrl({
        sessionId: "hw-session-1",
        filename: "extra.jpg",
        contentType: "image/jpeg",
        fileSize: 1024,
      })
    ).rejects.toThrow("MAX_IMAGES_REACHED");
  });

  test("returns presigned URL and object key for valid request", async () => {
    seedSession();
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.upload.getPresignedUploadUrl({
      sessionId: "hw-session-1",
      filename: "photo.jpg",
      contentType: "image/jpeg",
      fileSize: 2 * 1024 * 1024,
    });

    expect(result.url).toContain("presigned-put");
    expect(result.objectKey).toMatch(/^homework\/student1\/hw-session-1\/.+\.jpg$/);
    expect(storageCalls.presignedPutUrls).toHaveLength(1);
  });

  test("allows PDF uploads up to 50MB", async () => {
    seedSession();
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.upload.getPresignedUploadUrl({
      sessionId: "hw-session-1",
      filename: "homework.pdf",
      contentType: "application/pdf",
      fileSize: 40 * 1024 * 1024,
    });

    expect(result.objectKey).toMatch(/\.pdf$/);
  });
});

describe("upload.confirmUpload", () => {
  test("creates HomeworkImage record", async () => {
    seedSession();
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.upload.confirmUpload({
      sessionId: "hw-session-1",
      objectKey: "homework/student1/hw-session-1/test.jpg",
      originalFilename: "photo.jpg",
      sortOrder: 0,
      exifRotation: 90,
      privacyStripped: true,
    });

    expect(result.id).toBeTruthy();
    expect(result.imageUrl).toBe("homework/student1/hw-session-1/test.jpg");
    expect(result.originalFilename).toBe("photo.jpg");
    expect(result.exifRotation).toBe(90);
    expect(result.privacyStripped).toBe(true);
    expect(db._homeworkImages).toHaveLength(1);
  });

  test("rejects when session is not in CREATED status", async () => {
    seedSession({ status: "CHECKING" });
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.confirmUpload({
        sessionId: "hw-session-1",
        objectKey: "homework/student1/hw-session-1/test.jpg",
        originalFilename: "photo.jpg",
        sortOrder: 0,
      })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });
});

describe("upload.getPresignedDownloadUrl", () => {
  test("returns URL for session owner", async () => {
    seedSession();
    const img = seedImage("hw-session-1", "homework/student1/hw-session-1/test.jpg");
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.upload.getPresignedDownloadUrl({ imageId: img.id });

    expect(result.url).toContain("presigned-get");
    expect(storageCalls.presignedGetUrls).toHaveLength(1);
  });

  test("rejects for unauthorized user", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const img = seedImage("hw-session-1", "homework/other/hw-session-1/test.jpg");
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.getPresignedDownloadUrl({ imageId: img.id })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("allows parent access if in same family", async () => {
    seedSession({ createdBy: "student1", studentId: "student1" });
    const img = seedImage("hw-session-1", "homework/student1/hw-session-1/test.jpg");

    // Create family with parent and student
    db._families.push({
      id: "family1", name: "Test Family", inviteCode: null,
      inviteCodeExpiresAt: null, deletedAt: null, createdAt: new Date(), updatedAt: new Date(),
    });
    db._familyMembers.push(
      { id: "fm1", userId: "parent1", familyId: "family1", role: "OWNER", joinedAt: new Date() },
      { id: "fm2", userId: "student1", familyId: "family1", role: "MEMBER", joinedAt: new Date() },
    );

    const caller = createCaller(createMockContext(db, parentSession));
    const result = await caller.upload.getPresignedDownloadUrl({ imageId: img.id });
    expect(result.url).toContain("presigned-get");
  });
});

describe("upload.deleteImage", () => {
  test("deletes image from MinIO and database", async () => {
    seedSession();
    const img = seedImage("hw-session-1", "homework/student1/hw-session-1/test.jpg");
    const caller = createCaller(createMockContext(db, studentSession));
    const result = await caller.upload.deleteImage({ imageId: img.id });

    expect(result.success).toBe(true);
    expect(storageCalls.deletedObjects).toContain("homework/student1/hw-session-1/test.jpg");
    expect(db._homeworkImages).toHaveLength(0);
  });

  test("rejects if session is not in CREATED status", async () => {
    seedSession({ status: "COMPLETED" });
    const img = seedImage("hw-session-1", "homework/student1/hw-session-1/test.jpg");
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.deleteImage({ imageId: img.id })
    ).rejects.toThrow("SESSION_NOT_IN_CREATED_STATUS");
  });

  test("rejects for non-owner", async () => {
    seedSession({ createdBy: "other", studentId: "other" });
    const img = seedImage("hw-session-1", "homework/other/hw-session-1/test.jpg");
    const caller = createCaller(createMockContext(db, studentSession));
    await expect(
      caller.upload.deleteImage({ imageId: img.id })
    ).rejects.toThrow("FORBIDDEN");
  });
});
