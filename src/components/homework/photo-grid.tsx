"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { X, GripVertical, ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { MAX_IMAGES_PER_SESSION } from "@/lib/validations/upload";
import type { UploadProgress } from "@/hooks/use-upload";
import { cn } from "@/lib/utils";

interface ImageItem {
  id: string;
  imageUrl: string;
  originalFilename: string | null;
  sortOrder: number;
}

interface UploadingItem {
  id: string; // temp ID for key
  filename: string;
  progress: UploadProgress;
}

interface PhotoGridProps {
  sessionId: string;
  images: ImageItem[];
  uploadingItems: UploadingItem[];
  onDelete: (imageId: string) => void;
  onReorder: (imageIds: string[]) => void;
}

function ThumbnailImage({ imageId }: { imageId: string }) {
  const { data } = trpc.upload.getPresignedDownloadUrl.useQuery(
    { imageId },
    { staleTime: 5 * 60 * 1000 } // Cache for 5 minutes
  );
  const [error, setError] = useState(false);

  if (!data?.url || error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-muted">
        <ImageOff className="h-6 w-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={data.url}
      alt=""
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
}

function UploadingOverlay({ progress }: { progress: UploadProgress }) {
  const t = useTranslations();

  const label =
    progress.status === "compressing"
      ? t("upload.compressing")
      : progress.status === "uploading"
        ? `${progress.progress}%`
        : progress.status === "confirming"
          ? t("upload.confirming")
          : "";

  return (
    <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center text-white text-xs">
      <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mb-1" />
      <span>{label}</span>
    </div>
  );
}

export function PhotoGrid({
  sessionId,
  images,
  uploadingItems,
  onDelete,
  onReorder,
}: PhotoGridProps) {
  const t = useTranslations();
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const totalCount = images.length + uploadingItems.length;

  const handleDragStart = useCallback(
    (e: React.DragEvent, index: number) => {
      e.dataTransfer.setData("text/plain", String(index));
      e.dataTransfer.effectAllowed = "move";
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropIndex: number) => {
      e.preventDefault();
      setDragOverIndex(null);

      const dragIndex = Number(e.dataTransfer.getData("text/plain"));
      if (dragIndex === dropIndex) return;

      const ids = images.map((img) => img.id);
      const [moved] = ids.splice(dragIndex, 1);
      ids.splice(dropIndex, 0, moved);
      onReorder(ids);
    },
    [images, onReorder]
  );

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <ImageOff className="h-12 w-12 mb-3" />
        <p>{t("homework.emptyUpload")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Count badge */}
      <div className="flex items-center justify-between">
        <Badge variant="secondary">
          {t("homework.photoCount", { count: totalCount, max: MAX_IMAGES_PER_SESSION })}
        </Badge>
        {images.length > 1 && (
          <span className="text-xs text-muted-foreground">
            {t("homework.dragToReorder")}
          </span>
        )}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {/* Uploaded images */}
        {images.map((img, index) => (
          <div
            key={img.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, index)}
            className={cn(
              "relative aspect-square rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing group",
              dragOverIndex === index
                ? "border-primary border-dashed"
                : "border-transparent"
            )}
          >
            <ThumbnailImage imageId={img.id} />

            {/* Drag handle (visible on hover) */}
            <div className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-4 w-4 text-white drop-shadow-md" />
            </div>

            {/* Delete button (visible on hover) */}
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(img.id);
              }}
            >
              <X className="h-3 w-3" />
            </Button>

            {/* Sort order badge */}
            <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              {index + 1}
            </div>
          </div>
        ))}

        {/* Uploading items */}
        {uploadingItems.map((item) => (
          <div
            key={item.id}
            className="relative aspect-square rounded-lg overflow-hidden border-2 border-primary/30 bg-muted"
          >
            <UploadingOverlay progress={item.progress} />
          </div>
        ))}
      </div>
    </div>
  );
}
