/**
 * Mock for @/lib/infra/storage — avoids loading MinIO client in Vitest unit tests.
 * Tracks calls for assertions.
 */

export const storageCalls: {
  ensureBucket: number;
  presignedPutUrls: Array<{ objectKey: string; contentType: string }>;
  presignedGetUrls: string[];
  deletedObjects: string[];
} = {
  ensureBucket: 0,
  presignedPutUrls: [],
  presignedGetUrls: [],
  deletedObjects: [],
};

export function resetStorageCalls() {
  storageCalls.ensureBucket = 0;
  storageCalls.presignedPutUrls = [];
  storageCalls.presignedGetUrls = [];
  storageCalls.deletedObjects = [];
}

export async function ensureBucket() {
  storageCalls.ensureBucket++;
}

export async function getPresignedPutUrl(objectKey: string, contentType: string) {
  storageCalls.presignedPutUrls.push({ objectKey, contentType });
  return { url: `http://minio:9000/presigned-put/${objectKey}`, objectKey };
}

export async function getPresignedGetUrl(objectKey: string) {
  storageCalls.presignedGetUrls.push(objectKey);
  return `http://minio:9000/presigned-get/${objectKey}`;
}

export async function deleteObject(objectKey: string) {
  storageCalls.deletedObjects.push(objectKey);
}

export function generateObjectKey(userId: string, sessionId: string, extension: string) {
  return `homework/${userId}/${sessionId}/test-uuid.${extension.toLowerCase().replace(/^\./, "")}`;
}
