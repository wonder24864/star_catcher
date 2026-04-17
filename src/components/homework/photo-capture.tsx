"use client";

import { useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Camera, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateImageFile } from "@/lib/upload/compress";
import { ALLOWED_IMAGE_TYPES } from "@/lib/domain/validations/upload";
import { toast } from "sonner";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";
import { cn } from "@/lib/utils";

interface PhotoCaptureProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  maxRemaining: number;
}

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

export function PhotoCapture({ onFilesSelected, disabled, maxRemaining }: PhotoCaptureProps) {
  const t = useTranslations();
  const { tier } = useTier();
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

      {/* Camera button — large circular, tier-adaptive shell */}
      <CameraButton
        tier={tier}
        disabled={isDisabled}
        onClick={() => cameraInputRef.current?.click()}
        ariaLabel={t("homework.takePhoto")}
      />

      {/* Spacer to balance layout */}
      <div className="w-[104px]" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tier-adaptive shutter button
// ---------------------------------------------------------------------------

function CameraButton({
  tier,
  disabled,
  onClick,
  ariaLabel,
}: {
  tier: GradeTier;
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  // Wonder: rainbow pulsing ring + bouncy press, rotating Camera on hover
  if (tier === "wonder") {
    return (
      <motion.div
        className="relative"
        whileHover={!disabled ? { scale: 1.05 } : undefined}
        whileTap={!disabled ? { scale: 0.92 } : undefined}
      >
        {/* Pulsing rainbow ring */}
        <motion.div
          aria-hidden
          className={cn(
            "absolute inset-0 rounded-full -m-2",
            "bg-[conic-gradient(from_0deg,_#f472b6,_#a78bfa,_#60a5fa,_#fbbf24,_#f472b6)]",
            "blur-md opacity-80"
          )}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        <motion.div
          aria-hidden
          className="absolute inset-0 rounded-full -m-1 bg-white/40"
          animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "relative flex items-center justify-center w-20 h-20 rounded-full",
            "bg-gradient-to-br from-fuchsia-500 via-pink-500 to-violet-600 text-white",
            "shadow-[0_10px_30px_-6px_rgba(236,72,153,0.7)]",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          <Camera className="h-8 w-8 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
        </button>
      </motion.div>
    );
  }

  // Cosmic: neon cyan glow + slow scanner arc
  if (tier === "cosmic") {
    return (
      <motion.div
        className="relative"
        whileHover={!disabled ? { scale: 1.04 } : undefined}
        whileTap={!disabled ? { scale: 0.96 } : undefined}
      >
        {/* Scanning arc (spinner) */}
        <motion.div
          aria-hidden
          className="absolute inset-0 -m-1.5 rounded-full border-2 border-transparent border-t-cyan-400 border-r-violet-400"
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />
        {/* Static glow ring */}
        <div
          aria-hidden
          className="absolute inset-0 -m-0.5 rounded-full ring-2 ring-cyan-400/40"
        />
        <button
          onClick={onClick}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "relative flex items-center justify-center w-20 h-20 rounded-full",
            "bg-gradient-to-br from-slate-800 to-indigo-900 text-cyan-200",
            "shadow-[0_0_24px_oklch(0.7_0.2_210_/_0.55)]",
            "border border-cyan-500/50",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
        >
          <Camera className="h-8 w-8 drop-shadow-[0_0_6px_rgba(100,220,255,0.9)]" />
        </button>
      </motion.div>
    );
  }

  // Flow: subtle hover lift + shine
  if (tier === "flow") {
    return (
      <motion.button
        onClick={onClick}
        disabled={disabled}
        aria-label={ariaLabel}
        whileHover={!disabled ? { y: -2 } : undefined}
        whileTap={!disabled ? { scale: 0.97 } : undefined}
        className={cn(
          "relative flex items-center justify-center w-20 h-20 rounded-full",
          "bg-gradient-to-br from-sky-500 to-indigo-600 text-white",
          "shadow-md hover:shadow-lg transition-shadow",
          "disabled:opacity-40 disabled:cursor-not-allowed"
        )}
      >
        <Camera className="h-8 w-8" />
      </motion.button>
    );
  }

  // Studio: stock
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground shadow-lg hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Camera className="h-8 w-8" />
    </button>
  );
}
