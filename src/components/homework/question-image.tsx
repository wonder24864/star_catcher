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
 * Note: current OCR schema doesn't tag which image a region belongs to for
 * multi-image sessions — the caller passes the relevant `imageId` (commonly
 * images[0]). Extending to multi-image sessions is a future schema change.
 */

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
  className,
}: {
  imageId: string;
  region: QuestionImageRegion | null | undefined;
  className?: string;
}) {
  const { data, isError } = trpc.upload.getPresignedDownloadUrl.useQuery(
    { imageId },
    { staleTime: 5 * 60 * 1000, enabled: !!region },
  );

  if (!region) return null;
  if (!data?.url || isError) {
    return (
      <div
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
      aria-label=""
      className={
        "rounded-md border bg-muted bg-no-repeat " + (className ?? "")
      }
      style={{
        aspectRatio: `${w} / ${h}`,
        backgroundImage: `url("${data.url}")`,
        backgroundSize: `${sizeX}% ${sizeY}%`,
        backgroundPosition: `${posX}% ${posY}%`,
      }}
    />
  );
}
