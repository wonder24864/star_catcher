import { Client } from "minio";

function validateMinioEnv() {
  const required = ["MINIO_ENDPOINT", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY"];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing MinIO environment variables: ${missing.join(", ")}`);
  }
}

function createMinioClient() {
  validateMinioEnv();
  return new Client({
    endPoint: process.env.MINIO_ENDPOINT!,
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
}

/**
 * Create a MinIO client using the public endpoint (for presigned URLs sent to browsers).
 * Falls back to the internal client if MINIO_PUBLIC_ENDPOINT is not set.
 */
function createPublicMinioClient() {
  const publicEndpoint = process.env.MINIO_PUBLIC_ENDPOINT;
  if (!publicEndpoint || publicEndpoint === process.env.MINIO_ENDPOINT) {
    return createMinioClient();
  }
  validateMinioEnv();
  return new Client({
    endPoint: publicEndpoint,
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === "true",
    accessKey: process.env.MINIO_ACCESS_KEY!,
    secretKey: process.env.MINIO_SECRET_KEY!,
  });
}

const globalForMinio = globalThis as unknown as {
  minio: Client | undefined;
  minioPublic: Client | undefined;
};

/**
 * Internal MinIO client for server-side operations (upload, delete, etc.).
 */
export function getMinioClient(): Client {
  if (!globalForMinio.minio) {
    globalForMinio.minio = createMinioClient();
  }
  return globalForMinio.minio;
}

/**
 * Public MinIO client for generating presigned URLs that browsers can use.
 * Signature is computed with the public hostname so it matches the request.
 */
export function getPublicMinioClient(): Client {
  if (!globalForMinio.minioPublic) {
    globalForMinio.minioPublic = createPublicMinioClient();
  }
  return globalForMinio.minioPublic;
}
