"use client";

import { useState, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc/client";
import { compressImage, validateImageFile } from "@/lib/upload/compress";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_PDF_SIZE,
  mimeToExtension,
} from "@/lib/validations/upload";

export type UploadStatus = "idle" | "compressing" | "uploading" | "confirming" | "done" | "error";

export interface UploadProgress {
  status: UploadStatus;
  /** Upload progress percentage (0-100), only meaningful during "uploading" */
  progress: number;
  /** i18n error key if status is "error" */
  errorKey?: string;
}

export interface UploadResult {
  id: string;
  objectKey: string;
  originalFilename: string;
}

export interface UseUploadOptions {
  sessionId: string;
  onSuccess?: (result: UploadResult) => void;
  onError?: (errorKey: string) => void;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000; // 1 second

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Upload a blob to a presigned PUT URL with progress tracking.
 * Uses XMLHttpRequest for upload progress events.
 */
function putToPresignedUrl(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (percent: number) => void,
  abortRef: React.RefObject<XMLHttpRequest | null>
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    abortRef.current = xhr;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed with status ${xhr.status}`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));

    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.send(blob);
  });
}

export function useUpload({ sessionId, onSuccess, onError }: UseUploadOptions) {
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    status: "idle",
    progress: 0,
  });

  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const cancelledRef = useRef(false);

  const getPresignedUrl = trpc.upload.getPresignedUploadUrl.useMutation();
  const confirmUpload = trpc.upload.confirmUpload.useMutation();

  const setError = useCallback(
    (errorKey: string) => {
      setUploadProgress({ status: "error", progress: 0, errorKey });
      onError?.(errorKey);
    },
    [onError]
  );

  const upload = useCallback(
    async (file: File, sortOrder: number) => {
      cancelledRef.current = false;

      const isImage = (ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type);
      const isPdf = file.type === "application/pdf";

      // 1. Client-side validation
      if (isImage) {
        const validationError = validateImageFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
      } else if (isPdf) {
        if (file.size > MAX_PDF_SIZE) {
          setError("upload.fileTooLarge");
          return;
        }
      } else {
        setError("upload.formatNotSupported");
        return;
      }

      try {
        // 2. Compress (images only)
        let uploadBlob: Blob = file;
        let exifRotation = 0;
        let privacyStripped = false;
        let contentType = file.type;

        if (isImage) {
          setUploadProgress({ status: "compressing", progress: 0 });
          const result = await compressImage(file);
          uploadBlob = result.blob;
          exifRotation = result.exifRotation;
          privacyStripped = result.privacyStripped;
          contentType = "image/jpeg"; // Compressed output is always JPEG
        }

        if (cancelledRef.current) return;

        // 3. Get presigned URL
        const uploadContentType = isImage ? ("image/jpeg" as const) : (file.type as typeof contentType);
        const { url, objectKey } = await getPresignedUrl.mutateAsync({
          sessionId,
          filename: file.name,
          contentType: uploadContentType as (typeof ALLOWED_IMAGE_TYPES)[number] | "application/pdf",
          fileSize: uploadBlob.size,
        });

        if (cancelledRef.current) return;

        // 4. PUT to MinIO with retry
        setUploadProgress({ status: "uploading", progress: 0 });

        let lastError: Error | null = null;
        for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
          if (cancelledRef.current) return;
          try {
            await putToPresignedUrl(
              url,
              uploadBlob,
              contentType,
              (percent) => setUploadProgress({ status: "uploading", progress: percent }),
              xhrRef
            );
            lastError = null;
            break;
          } catch (e) {
            lastError = e instanceof Error ? e : new Error(String(e));
            if (lastError.message === "Upload cancelled") throw lastError;
            if (attempt < MAX_RETRIES - 1) {
              await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
            }
          }
        }

        if (lastError) {
          setError("upload.networkError");
          return;
        }

        if (cancelledRef.current) return;

        // 5. Confirm upload
        setUploadProgress({ status: "confirming", progress: 100 });

        const image = await confirmUpload.mutateAsync({
          sessionId,
          objectKey,
          originalFilename: file.name,
          sortOrder,
          exifRotation,
          privacyStripped,
        });

        // 6. Done
        setUploadProgress({ status: "done", progress: 100 });
        onSuccess?.({
          id: image.id,
          objectKey: image.imageUrl,
          originalFilename: image.originalFilename ?? file.name,
        });
      } catch (e) {
        if (cancelledRef.current) return;
        const message = e instanceof Error ? e.message : String(e);

        if (message.includes("MAX_IMAGES_REACHED")) {
          setError("upload.maxImagesReached");
        } else if (message.includes("SESSION_NOT_FOUND")) {
          setError("upload.sessionNotFound");
        } else if (message.includes("FILE_TOO_LARGE")) {
          setError("upload.fileTooLarge");
        } else {
          setError("upload.error");
        }
      }
    },
    [sessionId, getPresignedUrl, confirmUpload, setError, onSuccess]
  );

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    xhrRef.current?.abort();
    setUploadProgress({ status: "idle", progress: 0 });
  }, []);

  const reset = useCallback(() => {
    cancelledRef.current = false;
    setUploadProgress({ status: "idle", progress: 0 });
  }, []);

  return { upload, uploadProgress, cancel, reset };
}
