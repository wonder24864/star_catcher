"use client";

/**
 * Tier-adaptive celebration animations.
 *
 * - wonder / cosmic: confetti burst (framer-motion, different color palettes)
 * - flow: ripple expansion (concentric circles)
 * - studio: sonner toast (no visual overlay)
 */

import { useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useTier } from "@/components/providers/grade-tier-provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CelebrationProps {
  show: boolean;
  /** Optional custom message (falls back to i18n) */
  message?: string;
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

const WONDER_COLORS = [
  "#FF6B6B", "#4ECDC4", "#FFE66D", "#FF8A5C", "#A8E6CF",
  "#FFDAC1", "#FF9FF3", "#74B9FF",
];

const COSMIC_COLORS = [
  "#A855F7", "#6366F1", "#3B82F6", "#06B6D4", "#8B5CF6",
  "#C084FC", "#818CF8", "#38BDF8",
];

// ---------------------------------------------------------------------------
// Confetti burst (wonder + cosmic)
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 20;

const CONFETTI_DURATION_MS = 1300; // slightly longer than 1.2s animation

function ConfettiAnimation({
  colors,
  onComplete,
}: {
  colors: string[];
  onComplete?: () => void;
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        color: colors[i % colors.length],
        x: (Math.random() - 0.5) * 300,
        y: -(Math.random() * 200 + 100),
        rotation: Math.random() * 720 - 360,
        scale: Math.random() * 0.6 + 0.4,
        size: Math.random() * 8 + 4,
      })),
    [colors]
  );

  // Fire onComplete after particles finish (timer, not onAnimationComplete
  // which fires immediately on the outer container's trivial animation)
  const completeFired = useRef(false);
  useEffect(() => {
    completeFired.current = false;
    const timer = setTimeout(() => {
      if (!completeFired.current) {
        completeFired.current = true;
        onComplete?.();
      }
    }, CONFETTI_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-sm"
          style={{
            width: p.size,
            height: p.size * 1.4,
            backgroundColor: p.color,
          }}
          initial={{ x: 0, y: 0, rotate: 0, scale: 0 }}
          animate={{
            x: p.x,
            y: p.y + 400, // gravity
            rotate: p.rotation,
            scale: [0, p.scale, p.scale, 0],
          }}
          transition={{
            duration: 1.2,
            ease: [0.25, 0.46, 0.45, 0.94],
            scale: { times: [0, 0.15, 0.7, 1] },
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ripple expansion (flow)
// ---------------------------------------------------------------------------

const RIPPLE_DURATION_MS = 1000; // covers 0.8s animation + 0.24s stagger

function RippleAnimation({ onComplete }: { onComplete?: () => void }) {
  const completeFired = useRef(false);
  useEffect(() => {
    completeFired.current = false;
    const timer = setTimeout(() => {
      if (!completeFired.current) {
        completeFired.current = true;
        onComplete?.();
      }
    }, RIPPLE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute rounded-full border-2 border-primary"
          initial={{ width: 20, height: 20, opacity: 0.8 }}
          animate={{ width: 200, height: 200, opacity: 0 }}
          transition={{
            duration: 0.8,
            delay: i * 0.12,
            ease: "easeOut",
          }}
        />
      ))}
      {/* Checkmark */}
      <motion.svg
        viewBox="0 0 24 24"
        className="h-10 w-10 text-primary"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <motion.path
          d="M5 13l4 4L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        />
      </motion.svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Celebration component
// ---------------------------------------------------------------------------

export function Celebration({ show, message, onComplete }: CelebrationProps) {
  const { celebration } = useTier();
  const t = useTranslations("common");

  // Studio tier: fire toast instead of overlay
  const fireToast = useCallback(() => {
    toast.success(message ?? t("completed"));
    onComplete?.();
  }, [message, t, onComplete]);

  useEffect(() => {
    if (show && celebration === "toast") {
      fireToast();
    }
  }, [show, celebration, fireToast]);

  // Toast-only tier: no DOM overlay
  if (celebration === "toast") return null;

  return (
    <AnimatePresence>
      {show && (
        <>
          {(celebration === "confetti" || celebration === "energy-burst") && (
            <ConfettiAnimation
              colors={celebration === "energy-burst" ? COSMIC_COLORS : WONDER_COLORS}
              onComplete={onComplete}
            />
          )}
          {celebration === "ripple" && (
            <RippleAnimation onComplete={onComplete} />
          )}
        </>
      )}
    </AnimatePresence>
  );
}
