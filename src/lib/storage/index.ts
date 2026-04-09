import crypto from "crypto";
import { getMinioClient } from "./minio";

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
 */
export async function getPresignedPutUrl(
  objectKey: string,
  _contentType: string
): Promise<{ url: string; objectKey: string }> {
  const url = await getMinioClient().presignedPutObject(BUCKET, objectKey, UPLOAD_URL_EXPIRY);
  return { url, objectKey };
}

/**
 * Generate a presigned GET URL for viewing/downloading an object.
 */
export async function getPresignedGetUrl(objectKey: string): Promise<string> {
  return getMinioClient().presignedGetObject(BUCKET, objectKey, DOWNLOAD_URL_EXPIRY);
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
