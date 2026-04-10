"use client";

import { useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateImageFile } from "@/lib/upload/compress";
import { ALLOWED_IMAGE_TYPES } from "@/lib/domain/validations/upload";
import { toast } from "sonner";

interface PhotoCaptureProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  maxRemaining: number;
}

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export function PhotoCapture({ onFilesSelected, disabled, maxRemaining }: PhotoCaptureProps) {
  const t = useTranslations();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const files = Array.from(fileList);
      const validFiles: File[] = [];

      for (const file of files) {
        const error = validateImageFile(file);
        if (error) {
          toast.error(t(error));
        } else {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) return;

      // Respect remaining limit
      if (validFiles.length > maxRemaining) {
        toast.warning(t("homework.maxPhotosReached", { max: 10 }));
        validFiles.splice(maxRemaining);
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [maxRemaining, onFilesSelected, t]
  );

  const isDisabled = disabled || maxRemaining <= 0;

  return (
    <div className="flex items-center justify-center gap-6 py-4">
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        disabled={isDisabled}
      />
      <input
        ref={albumInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
        disabled={isDisabled}
      />

      {/* Album button */}
      <Button
        variant="outline"
        size="lg"
        onClick={() => albumInputRef.current?.click()}
        disabled={isDisabled}
        className="flex flex-col items-center gap-1 h-auto py-3 px-6"
      >
        <ImagePlus className="h-6 w-6" />
        <span className="text-xs">{t("homework.selectFromAlbum")}</span>
      </Button>

      {/* Camera button — large circular */}
      <button
        onClick={() => cameraInputRef.current?.click()}
        disabled={isDisabled}
        className="flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label={t("homework.takePhoto")}
      >
        <Camera className="h-8 w-8" />
      </button>

      {/* Spacer to balance layout */}
      <div className="w-[104px]" />
    </div>
  );
}
