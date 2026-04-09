import { z } from "zod";

// --- Constants (shared between server and client) ---

export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
] as const;

export const ALLOWED_PDF_TYPE = "application/pdf" as const;

export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_IMAGE_TYPES, ALLOWED_PDF_TYPE] as const;

/** Raw image max size before compression: 20MB */
export const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/** Compressed image target size: 4MB */
export const MAX_COMPRESSED_SIZE = 4 * 1024 * 1024;

/** PDF max size: 50MB */
export const MAX_PDF_SIZE = 50 * 1024 * 1024;

/** Max images per homework session */
export const MAX_IMAGES_PER_SESSION = 10;

/** JPEG compression quality */
export const COMPRESSION_QUALITY = 0.85;

/** Max image width after compression (px) */
export const MAX_IMAGE_WIDTH = 4096;

// --- File extension mapping ---

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "jpg", // HEIC converted to JPEG
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function mimeToExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] || "bin";
}

// --- Zod Schemas ---

export const requestPresignedUploadUrlSchema = z.object({
  sessionId: z.string().min(1),
  filename: z.string().min(1).max(255),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  fileSize: z.number().positive(),
});

export const confirmUploadSchema = z.object({
  sessionId: z.string().min(1),
  objectKey: z.string().min(1),
  originalFilename: z.string().min(1).max(255),
  sortOrder: z.number().int().min(0).max(9),
  exifRotation: z.number().int().min(0).max(360).default(0),
  privacyStripped: z.boolean().default(false),
});

export const requestPresignedDownloadUrlSchema = z.object({
  imageId: z.string().min(1),
});

export const deleteImageSchema = z.object({
  imageId: z.string().min(1),
});

export type RequestPresignedUploadUrlInput = z.infer<typeof requestPresignedUploadUrlSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
