"use client";

/**
 * ImageTabSwitcher — horizontal pill tabs for switching the active image
 * in the canvas view, shown only when the session has 2+ photos.
 *
 * Each tab shows the image number + a small dot indicating how many
 * questions from that image are still unjudged (isCorrect === null).
 */

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

export type ImageTabStats = {
  imageId: string;
  number: number;
  total: number;
  unjudged: number;
  wrong: number;
};

export function ImageTabSwitcher({
  images,
  activeImageId,
  onSelect,
}: {
  images: ImageTabStats[];
  activeImageId: string;
  onSelect: (imageId: string) => void;
}) {
  const t = useTranslations();
  if (images.length <= 1) return null;

  return (
    <div
      className="flex gap-2 overflow-x-auto py-2"
      role="tablist"
      aria-label={t("homework.markup.imageTabsAria")}
    >
      {images.map((img) => {
        const active = img.imageId === activeImageId;
        return (
          <button
            key={img.imageId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(img.imageId)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:bg-muted",
            )}
          >
            <span>{t("homework.markup.image", { n: img.number })}</span>
            {img.unjudged > 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-4 h-4 rounded-full px-1 text-[10px] font-semibold",
                  active ? "bg-white/25 text-white" : "bg-amber-100 text-amber-700",
                )}
                aria-label={t("homework.markup.unjudgedCount", { n: img.unjudged })}
              >
                {img.unjudged}
              </span>
            )}
            {img.wrong > 0 && img.unjudged === 0 && (
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-4 h-4 rounded-full px-1 text-[10px] font-semibold",
                  active ? "bg-white/25 text-white" : "bg-red-100 text-red-700",
                )}
                aria-label={t("homework.markup.wrongOnImage", { n: img.wrong })}
              >
                {img.wrong}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
