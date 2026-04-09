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

const globalForMinio = globalThis as unknown as {
  minio: Client | undefined;
};

/**
 * Lazy-initialized MinIO client singleton.
 * Env vars are validated on first access, not at import time,
 * to avoid breaking tests and build processes that don't need MinIO.
 */
export function getMinioClient(): Client {
  if (!globalForMinio.minio) {
    globalForMinio.minio = createMinioClient();
  }
  return globalForMinio.minio;
}
