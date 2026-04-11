import crypto from "crypto";
import { getMinioClient, getPublicMinioClient } from "./minio";

const BUCKET = process.env.MINIO_BUCKET || "star-catcher";
const UPLOAD_URL_EXPIRY = 3600; // 1 hour
const DOWNLOAD_URL_EXPIRY = 7 * 24 * 3600; // 7 days

/**
 * Ensure the storage bucket exists. Call once at app startup.
 */
export async function ensureBucket(): Promise<void> {
  const client = getMinioClient();
  const exists = await client.bucketExists(BUCKET);
  if (!exists) {
    await client.makeBucket(BUCKET);
  }
}

/**
 * Generate a presigned PUT URL for direct client upload to MinIO.
 * Uses the public MinIO client so the signature matches the browser's request host.
 */
export async function getPresignedPutUrl(
  objectKey: string,
  _contentType: string
): Promise<{ url: string; objectKey: string }> {
  const url = await getPublicMinioClient().presignedPutObject(BUCKET, objectKey, UPLOAD_URL_EXPIRY);
  return { url, objectKey };
}

/**
 * Generate a presigned GET URL for viewing/downloading an object.
 * Uses the public MinIO client so the signature matches the browser's request host.
 */
export async function getPresignedGetUrl(objectKey: string): Promise<string> {
  return getPublicMinioClient().presignedGetObject(BUCKET, objectKey, DOWNLOAD_URL_EXPIRY);
}

/**
 * Read an object from MinIO and return it as a base64 data URL.
 * Used for passing images to external AI APIs (e.g., Azure OpenAI)
 * that cannot access MinIO directly.
 */
export async function getObjectAsBase64DataUrl(objectKey: string): Promise<string> {
  const EXT_TO_MIME: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  };

  const ext = objectKey.split(".").pop()?.toLowerCase() ?? "";
  const mime = EXT_TO_MIME[ext] ?? "image/jpeg";

  const stream = await getMinioClient().getObject(BUCKET, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

/**
 * Read an object from MinIO and return its raw Buffer.
 * Used for processing files server-side (e.g., PDF parsing).
 */
export async function getObjectBuffer(objectKey: string): Promise<Buffer> {
  const stream = await getMinioClient().getObject(BUCKET, objectKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Delete an object from MinIO.
 */
export async function deleteObject(objectKey: string): Promise<void> {
  await getMinioClient().removeObject(BUCKET, objectKey);
}

/**
 * Generate a structured object key for homework images.
 * Format: homework/{userId}/{sessionId}/{uuid}.{ext}
 */
export function generateObjectKey(
  userId: string,
  sessionId: string,
  extension: string
): string {
  const ext = extension.toLowerCase().replace(/^\./, "");
  const uuid = crypto.randomUUID();
  return `homework/${userId}/${sessionId}/${uuid}.${ext}`;
}
