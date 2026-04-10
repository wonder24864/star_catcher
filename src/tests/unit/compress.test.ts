/**
 * Unit Tests: Image Compression Utility
 * Tests validation and EXIF orientation mapping logic.
 * Full Canvas-based compression is browser-only and tested in E2E.
 */
import { describe, test, expect } from "vitest";
import { validateImageFile } from "@/lib/upload/compress";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  MAX_PDF_SIZE,
  MAX_IMAGES_PER_SESSION,
  MAX_COMPRESSED_SIZE,
  MAX_IMAGE_WIDTH,
  COMPRESSION_QUALITY,
  mimeToExtension,
} from "@/lib/domain/validations/upload";

describe("Upload Validation Constants", () => {
  test("ALLOWED_IMAGE_TYPES contains expected formats", () => {
    expect(ALLOWED_IMAGE_TYPES).toContain("image/jpeg");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/png");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/heic");
    expect(ALLOWED_IMAGE_TYPES).toContain("image/webp");
  });

  test("MAX_IMAGE_SIZE is 20MB", () => {
    expect(MAX_IMAGE_SIZE).toBe(20 * 1024 * 1024);
  });

  test("MAX_COMPRESSED_SIZE is 4MB", () => {
    expect(MAX_COMPRESSED_SIZE).toBe(4 * 1024 * 1024);
  });

  test("MAX_PDF_SIZE is 50MB", () => {
    expect(MAX_PDF_SIZE).toBe(50 * 1024 * 1024);
  });

  test("MAX_IMAGES_PER_SESSION is 10", () => {
    expect(MAX_IMAGES_PER_SESSION).toBe(10);
  });

  test("COMPRESSION_QUALITY is 0.85", () => {
    expect(COMPRESSION_QUALITY).toBe(0.85);
  });

  test("MAX_IMAGE_WIDTH is 4096", () => {
    expect(MAX_IMAGE_WIDTH).toBe(4096);
  });
});

describe("mimeToExtension", () => {
  test("maps image/jpeg to jpg", () => {
    expect(mimeToExtension("image/jpeg")).toBe("jpg");
  });

  test("maps image/png to png", () => {
    expect(mimeToExtension("image/png")).toBe("png");
  });

  test("maps image/heic to jpg (converted)", () => {
    expect(mimeToExtension("image/heic")).toBe("jpg");
  });

  test("maps image/webp to webp", () => {
    expect(mimeToExtension("image/webp")).toBe("webp");
  });

  test("maps application/pdf to pdf", () => {
    expect(mimeToExtension("application/pdf")).toBe("pdf");
  });

  test("returns bin for unknown types", () => {
    expect(mimeToExtension("application/octet-stream")).toBe("bin");
  });
});

describe("validateImageFile", () => {
  function makeFile(type: string, size: number): File {
    const buffer = new ArrayBuffer(Math.min(size, 8)); // Don't allocate huge buffers in tests
    const file = new File([buffer], "test.jpg", { type });
    Object.defineProperty(file, "size", { value: size });
    return file;
  }

  test("accepts valid JPEG file", () => {
    expect(validateImageFile(makeFile("image/jpeg", 5 * 1024 * 1024))).toBeNull();
  });

  test("accepts valid PNG file", () => {
    expect(validateImageFile(makeFile("image/png", 1 * 1024 * 1024))).toBeNull();
  });

  test("accepts valid HEIC file", () => {
    expect(validateImageFile(makeFile("image/heic", 10 * 1024 * 1024))).toBeNull();
  });

  test("accepts valid WebP file", () => {
    expect(validateImageFile(makeFile("image/webp", 2 * 1024 * 1024))).toBeNull();
  });

  test("rejects unsupported format", () => {
    expect(validateImageFile(makeFile("image/bmp", 1024))).toBe("upload.formatNotSupported");
  });

  test("rejects GIF format", () => {
    expect(validateImageFile(makeFile("image/gif", 1024))).toBe("upload.formatNotSupported");
  });

  test("rejects images larger than 20MB", () => {
    expect(validateImageFile(makeFile("image/jpeg", 21 * 1024 * 1024))).toBe("upload.fileTooLarge");
  });

  test("accepts images at exactly 20MB", () => {
    expect(validateImageFile(makeFile("image/jpeg", 20 * 1024 * 1024))).toBeNull();
  });
});
