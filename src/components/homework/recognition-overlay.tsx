"use client";

/**
 * Full-screen "AI is recognizing…" overlay.
 *
 * Shown on /check/new after the user clicks "开始识别" and kept visible
 * across the navigation to /check/[sessionId], where the same overlay is
 * rendered for RECOGNIZING status — so the transition feels seamless.
 *
 * Tier-adaptive visual:
 * - wonder: rainbow scan + sparkles
 * - cosmic: neon scan lines + particles
 * - flow:   clean blur + thin progress
 * - studio: minimal spinner
 */

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Sparkles, ScanLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

interface RecognitionOverlayProps {
  /** When true, overlay is rendered. Parent controls mounting to allow exit animations. */
  open: boolean;
  /** Optional status message override. Defaults to i18n "homework.recognizing". */
  message?: string;
  /** Optional subtext. Defaults to tier-specific encouragement. */
  subtitle?: string;
  /** Force tier (mostly for previewing). */
  tierOverride?: GradeTier;
}

const DEFAULT_SUBTITLES: Record<GradeTier, string> = {
  wonder: "student.recognition.subtitleWonder",
  cosmic: "student.recognition.subtitleCosmic",
  flow: "student.recognition.subtitleFlow",
  studio: "student.recognition.subtitleStudio",
};

export function RecognitionOverlay({
  open,
  message,
  subtitle,
  tierOverride,
}: RecognitionOverlayProps) {
  const t = useTranslations();
  const { tier: ctxTier } = useTier();
  const tier = tierOverride ?? ctxTier;

  if (!open) return null;

  const title = message ?? t("homework.recognizing");
  const sub = subtitle ?? t(DEFAULT_SUBTITLES[tier] as never);

  const bgClass =
    tier === "wonder"
      ? "bg-gradient-to-br from-rose-200/95 via-fuchsia-200/95 to-violet-300/95"
      : tier === "cosmic"
        ? "bg-gradient-to-br from-slate-950/95 via-indigo-950/95 to-violet-950/95"
        : tier === "flow"
          ? "bg-background/85 backdrop-blur-md"
          : "bg-background/90 backdrop-blur-sm";

  const textColor =
    tier === "wonder"
      ? "text-fuchsia-900"
      : tier === "cosmic"
        ? "text-white"
        : "text-foreground";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center",
        "backdrop-blur-md",
        bgClass,
        textColor
      )}
      role="status"
      aria-live="polite"
    >
      {/* Tier-specific decorative animation */}
      {tier === "wonder" && <WonderVisual />}
      {tier === "cosmic" && <CosmicVisual />}
      {tier === "flow" && <FlowVisual />}
      {tier === "studio" && <StudioVisual />}

      {/* Text block */}
      <motion.div
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="mt-8 text-center px-6 max-w-sm"
      >
        <h2
          className={cn(
            "font-bold",
            tier === "wonder" ? "text-2xl" : "text-xl"
          )}
        >
          {title}
        </h2>
        <p className="mt-2 text-sm opacity-80">{sub}</p>
      </motion.div>
    </motion.div>
  );
}

// ─── Wonder (P1-3) ────────────────────────────────
function WonderVisual() {
  return (
    <div className="relative h-40 w-40">
      {/* Orbiting sparkles */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="absolute top-1/2 left-1/2"
          initial={{ rotate: i * 72 }}
          animate={{ rotate: i * 72 + 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "center" }}
        >
          <div style={{ transform: "translate(60px, -8px)" }}>
            <Sparkles className="h-6 w-6 text-yellow-400 drop-shadow-[0_0_6px_rgba(255,220,100,0.9)]" />
          </div>
        </motion.div>
      ))}
      {/* Pulsing heart-core */}
      <motion.div
        className="absolute inset-0 m-auto h-24 w-24 rounded-full bg-gradient-to-br from-pink-400 via-fuchsia-400 to-violet-500 shadow-[0_0_40px_rgba(240,100,200,0.7)]"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ rotate: [0, 8, -8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <Sparkles className="h-12 w-12 text-white drop-shadow-lg" />
      </motion.div>
    </div>
  );
}

// ─── Cosmic (P4-6) ────────────────────────────────
function CosmicVisual() {
  return (
    <div className="relative h-56 w-56">
      {/* Outer scanning ring */}
      <motion.div
        className="absolute inset-0 rounded-full border-2 border-cyan-400/50"
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(100,220,255,0.9)]" />
      </motion.div>
      {/* Inner scanning ring */}
      <motion.div
        className="absolute inset-4 rounded-full border-2 border-violet-400/50"
        animate={{ rotate: -360 }}
        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full bg-violet-300 shadow-[0_0_12px_rgba(180,120,255,0.9)]" />
      </motion.div>
      {/* Core */}
      <motion.div
        className="absolute inset-0 m-auto h-24 w-24 rounded-full bg-gradient-to-br from-cyan-500/40 to-violet-500/40 backdrop-blur-sm border border-cyan-400/40"
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        <ScanLine className="h-10 w-10 text-cyan-200 drop-shadow-[0_0_8px_rgba(100,220,255,0.8)]" />
      </motion.div>
    </div>
  );
}

// ─── Flow (junior) ────────────────────────────────
function FlowVisual() {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-16 w-16">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <ScanLine className="h-6 w-6 text-primary" />
        </div>
      </div>
      {/* Thin horizontal progress shimmer */}
      <div className="h-1 w-48 overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full w-1/3 rounded-full bg-primary"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}

// ─── Studio (senior) ──────────────────────────────
function StudioVisual() {
  return (
    <div className="flex items-center gap-3">
      <motion.div
        className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}
