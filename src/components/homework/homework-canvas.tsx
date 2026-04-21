"use client";

/**
 * HomeworkCanvas — the zoom/pan image viewer with clickable question
 * bounding boxes overlaid on the original homework photo.
 *
 * Sprint 17. Replaces the old per-question cropped thumbnails with a single
 * full-photo canvas where each AI-detected question shows a ✓/✗/? badge
 * that the user taps to mark correct/incorrect or drill into.
 *
 * Coordinate system: imageRegion is {x, y, w, h} in percent (0-100) relative
 * to the source image's natural dimensions. The SVG overlay uses
 * `viewBox="0 0 100 100"` with `preserveAspectRatio="none"` so the rects
 * stretch to follow the rendered image exactly, independent of container
 * aspect ratio. Zoom + pan are handled by react-zoom-pan-pinch, which
 * transforms the whole wrapper (image + SVG together), so overlays stay
 * pixel-perfect at any zoom level.
 */

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { QuestionBox, type QuestionBoxStatus } from "./question-box";

export type CanvasQuestion = {
  id: string;
  questionNumber: number;
  isCorrect: boolean | null;
  needsReview: boolean;
  imageRegion: { x: number; y: number; w: number; h: number } | null;
};

export function HomeworkCanvas({
  imageId,
  questions,
  onTapQuestion,
  highlightedQuestionId,
  className,
}: {
  imageId: string;
  questions: CanvasQuestion[];
  onTapQuestion: (questionId: string) => void;
  highlightedQuestionId?: string | null;
  className?: string;
}) {
  const [loadFailed, setLoadFailed] = useState(false);
  const { data, isError } = trpc.upload.getPresignedDownloadUrl.useQuery(
    { imageId },
    { staleTime: 5 * 60 * 1000 },
  );

  if (isError || loadFailed) {
    return (
      <div
        className={cn(
          "flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed bg-muted",
          className,
        )}
      >
        <ImageOff className="h-10 w-10 text-muted-foreground" />
      </div>
    );
  }

  if (!data?.url) {
    return (
      <div
        className={cn(
          "flex aspect-[3/4] items-center justify-center rounded-lg border bg-muted/50 animate-pulse",
          className,
        )}
      />
    );
  }

  const boxQuestions = questions.filter(
    (q): q is CanvasQuestion & { imageRegion: NonNullable<CanvasQuestion["imageRegion"]> } =>
      q.imageRegion !== null,
  );

  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-lg border bg-muted/30 touch-none",
        className,
      )}
    >
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={5}
        wheel={{ step: 0.2 }}
        doubleClick={{ mode: "toggle", step: 1.5 }}
        pinch={{ step: 8 }}
        panning={{ velocityDisabled: false, excluded: ["clickable-question"] }}
      >
        <TransformComponent
          wrapperClass="!w-full !h-full"
          contentClass="!w-full !h-full relative"
        >
          <div className="relative w-full">
            {/* next/image would strip the MinIO presigned URL's query-string
               auth params and requires domain allow-listing that doesn't fit
               per-session signed URLs. Plain <img> is correct here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.url}
              alt=""
              className="block w-full h-auto select-none pointer-events-none"
              onError={() => setLoadFailed(true)}
              draggable={false}
            />
            {/* Overlay boxes. preserveAspectRatio="none" stretches the 0-100
               viewBox exactly over the image. pointer-events: auto on rects
               so taps hit them; the svg itself passes through to the image. */}
            <svg
              className="absolute inset-0 h-full w-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {boxQuestions.map((q) => (
                <QuestionBox
                  key={q.id}
                  x={q.imageRegion.x}
                  y={q.imageRegion.y}
                  w={q.imageRegion.w}
                  h={q.imageRegion.h}
                  questionNumber={q.questionNumber}
                  status={resolveStatus(q)}
                  highlighted={highlightedQuestionId === q.id}
                  onTap={() => onTapQuestion(q.id)}
                />
              ))}
            </svg>
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

function resolveStatus(q: CanvasQuestion): QuestionBoxStatus {
  if (q.isCorrect === true) return "correct";
  if (q.isCorrect === false) return "incorrect";
  if (q.needsReview) return "review";
  return "unknown";
}
