"use client";

/**
 * QuestionImage — renders the image region OCR associated with a question.
 *
 * Uses percentage `imageRegion` (x/y/w/h, all 0-100) from the SessionQuestion
 * row to crop the source HomeworkImage via CSS transform. No server-side
 * cropping; original asset is unmodified.
 *
 * If no imageRegion is stored, the component renders nothing — not all
 * questions have an associated figure.
 *
 * Multi-image limitation: OCR schema currently doesn't tag which source
 * image a region belongs to. When a session has multiple images, picking
 * images[0] would show wrong crops for questions from image 2+. Callers
 * MUST gate on single-image sessions (pass null imageId otherwise). When
 * we add `imageIndex` to the OCR schema + migrate existing rows, this
 * component can accept the full images[] array and dispatch by index.
 */

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { trpc } from "@/lib/trpc/client";

export type QuestionImageRegion = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export function QuestionImage({
  imageId,
  region,
  alt,
  className,
}: {
  /** Pass null when the session has multiple images — see multi-image note above. */
  imageId: string | null;
  region: QuestionImageRegion | null | undefined;
  /** Accessible description, e.g. "第 3 题的配图". Falls back to generic if empty. */
  alt?: string;
  className?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const { data, isError } = trpc.upload.getPresignedDownloadUrl.useQuery(
    { imageId: imageId ?? "" },
    { staleTime: 5 * 60 * 1000, enabled: !!region && !!imageId },
  );

  if (!region || !imageId) return null;
  if (!data?.url || isError || loadFailed) {
    return (
      <div
        role="img"
        aria-label={alt ?? "图片加载失败"}
        className={
          "flex aspect-video items-center justify-center rounded-md border border-dashed bg-muted " +
          (className ?? "")
        }
      >
        <ImageOff className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  // CSS-crop via background-image. Simpler than absolute <img> tricks because
  // background-size + background-position let us independently stretch and
  // align the crop without depending on source aspect ratio.
  //
  // - background-size X%/Y%: the image fills (100/w × container width) by
  //   (100/h × container height), so only region.w × region.h of the source
  //   fits the frame.
  // - background-position P%: aligns p% of image with p% of container, which
  //   means P = region.x / (100 - region.w) × 100 to put region's left edge
  //   at the frame's left.
  const w = Math.max(Math.min(region.w, 99.5), 0.5);
  const h = Math.max(Math.min(region.h, 99.5), 0.5);
  const sizeX = (100 / w) * 100;
  const sizeY = (100 / h) * 100;
  const posX = (region.x / (100 - w)) * 100;
  const posY = (region.y / (100 - h)) * 100;

  return (
    <div
      role="img"
      aria-label={alt ?? "题目配图"}
      className={
        "relative rounded-md border bg-muted bg-no-repeat " + (className ?? "")
      }
      style={{
        aspectRatio: `${w} / ${h}`,
        backgroundImage: `url("${data.url}")`,
        backgroundSize: `${sizeX}% ${sizeY}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    >
      {/* Hidden probe: background-image has no onError, so mirror the URL
         through a 1×1 <img> to detect failed loads (e.g. expired presigned URL). */}
      <img
        src={data.url}
        alt=""
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        onError={() => setLoadFailed(true)}
      />
    </div>
  );
}
