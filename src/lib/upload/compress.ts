import {
  COMPRESSION_QUALITY,
  MAX_COMPRESSED_SIZE,
  MAX_IMAGE_WIDTH,
  MAX_IMAGE_SIZE,
  ALLOWED_IMAGE_TYPES,
} from "@/lib/validations/upload";

export interface CompressResult {
  blob: Blob;
  width: number;
  height: number;
  /** EXIF orientation correction applied, in degrees (0/90/180/270) */
  exifRotation: number;
  /** True if privacy EXIF data (GPS, etc.) was stripped */
  privacyStripped: boolean;
}

/** Map EXIF orientation tag (1-8) to rotation degrees */
function exifOrientationToDegrees(orientation: number): number {
  switch (orientation) {
    case 3:
    case 4:
      return 180;
    case 5:
    case 6:
      return 90;
    case 7:
    case 8:
      return 270;
    default:
      return 0;
  }
}

/** Check if the EXIF orientation involves a 90/270 degree swap of width/height */
function orientationSwapsDimensions(orientation: number): boolean {
  return orientation >= 5 && orientation <= 8;
}

/**
 * Read EXIF orientation from an image file.
 * Returns orientation value (1-8), defaults to 1 (normal).
 */
async function readExifOrientation(file: File): Promise<number> {
  try {
    const exifr = await import("exifr");
    const result = await exifr.orientation(file);
    return result ?? 1;
  } catch {
    return 1;
  }
}

/**
 * Convert HEIC file to JPEG Blob. Uses dynamic import to avoid bundling heic2any
 * unless actually needed.
 */
async function convertHeicToJpeg(file: File): Promise<Blob> {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(result) ? result[0] : result;
}

/**
 * Load an image Blob into an HTMLImageElement.
 */
function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Draw image on canvas with EXIF orientation correction and size constraints.
 */
function drawCorrectedImage(
  img: HTMLImageElement,
  orientation: number,
  maxWidth: number
): { canvas: HTMLCanvasElement; width: number; height: number } {
  let { naturalWidth: w, naturalHeight: h } = img;

  // Calculate display dimensions (before orientation transform)
  const swap = orientationSwapsDimensions(orientation);
  const displayW = swap ? h : w;
  const displayH = swap ? w : h;

  // Scale down if needed
  let targetW = displayW;
  let targetH = displayH;
  if (targetW > maxWidth) {
    const ratio = maxWidth / targetW;
    targetW = maxWidth;
    targetH = Math.round(targetH * ratio);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;

  const ctx = canvas.getContext("2d")!;

  // Apply orientation correction
  ctx.save();
  switch (orientation) {
    case 2:
      ctx.scale(-1, 1);
      ctx.translate(-targetW, 0);
      break;
    case 3:
      ctx.translate(targetW, targetH);
      ctx.rotate(Math.PI);
      break;
    case 4:
      ctx.scale(1, -1);
      ctx.translate(0, -targetH);
      break;
    case 5:
      ctx.translate(targetW, 0);
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
      break;
    case 6:
      ctx.translate(targetW, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 7:
      ctx.translate(0, targetH);
      ctx.rotate(-Math.PI / 2);
      ctx.scale(1, -1);
      break;
    case 8:
      ctx.translate(0, targetH);
      ctx.rotate(-Math.PI / 2);
      break;
  }

  // When orientation swaps dimensions, draw with swapped target size
  if (swap) {
    ctx.drawImage(img, 0, 0, targetH, targetW);
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }
  ctx.restore();

  return { canvas, width: targetW, height: targetH };
}

/**
 * Convert canvas to JPEG blob at the given quality.
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/jpeg",
      quality
    );
  });
}

/**
 * Validate that a file is an allowed image type and within size limits.
 */
export function validateImageFile(file: File): string | null {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "upload.formatNotSupported";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "upload.fileTooLarge";
  }
  return null;
}

/**
 * Compress an image file for upload.
 *
 * Pipeline:
 * 1. Read EXIF orientation
 * 2. Convert HEIC to JPEG if needed
 * 3. Draw on Canvas with orientation correction and max width constraint
 * 4. Encode as JPEG, iteratively reducing quality until under 4MB
 *
 * Canvas toBlob() naturally strips all EXIF metadata (including GPS).
 */
export async function compressImage(
  file: File,
  options?: {
    maxWidth?: number;
    quality?: number;
    maxSizeBytes?: number;
  }
): Promise<CompressResult> {
  const maxWidth = options?.maxWidth ?? MAX_IMAGE_WIDTH;
  const initialQuality = options?.quality ?? COMPRESSION_QUALITY;
  const maxSize = options?.maxSizeBytes ?? MAX_COMPRESSED_SIZE;

  // 1. Read EXIF orientation before any conversion
  const orientation = await readExifOrientation(file);
  const exifRotation = exifOrientationToDegrees(orientation);

  // 2. Convert HEIC if needed
  let imageBlob: Blob = file;
  if (file.type === "image/heic") {
    imageBlob = await convertHeicToJpeg(file);
  }

  // 3. Load image
  const img = await loadImage(imageBlob);

  // 4. Draw with orientation correction
  const { canvas, width, height } = drawCorrectedImage(img, orientation, maxWidth);

  // 5. Encode JPEG, iteratively reduce quality if too large
  let quality = initialQuality;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > maxSize && quality > 0.5) {
    quality -= 0.05;
    blob = await canvasToBlob(canvas, quality);
  }

  return {
    blob,
    width,
    height,
    exifRotation,
    privacyStripped: true, // Canvas re-encoding strips all EXIF
  };
}
