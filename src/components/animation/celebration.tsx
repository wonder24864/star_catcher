"use client";

/**
 * Tier-adaptive celebration animations.
 *
 * - wonder / cosmic: star burst — SVG stars exploding outward from the center
 *   with rotation + trailing glow halo. Palettes differ (pastel vs neon).
 * - flow: ripple expansion (concentric circles).
 * - studio: sonner toast (no visual overlay).
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
// Star burst (wonder + cosmic)
// ---------------------------------------------------------------------------

const PARTICLE_COUNT = 18;
const BURST_DURATION_MS = 1400; // slightly longer than 1.3s animation

/** Classic 5-point star path on a 20×20 viewbox. */
const STAR_PATH =
  "M10 0l2.9 6.5 7.1.8-5.3 4.8 1.5 7-6.2-3.5-6.2 3.5 1.5-7L0 7.3l7.1-.8z";

function StarBurstAnimation({
  colors,
  glow,
  onComplete,
}: {
  colors: string[];
  /** When true, add a soft outer halo on each star (cosmic neon look). */
  glow: boolean;
  onComplete?: () => void;
}) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, i) => {
        // Angle around a circle, slightly randomized for organic feel.
        const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const distance = 160 + Math.random() * 120;
        return {
          id: i,
          color: colors[i % colors.length],
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance,
          rotation: Math.random() * 540 - 270,
          scale: 0.8 + Math.random() * 0.7,
          size: 18 + Math.floor(Math.random() * 10),
          delay: Math.random() * 0.08,
        };
      }),
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
    }, BURST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {/* Center flash ring */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        style={{
          width: 120,
          height: 120,
          marginLeft: -60,
          marginTop: -60,
          background: glow
            ? "radial-gradient(circle, rgba(168,85,247,0.45) 0%, rgba(168,85,247,0) 70%)"
            : "radial-gradient(circle, rgba(255,220,180,0.55) 0%, rgba(255,220,180,0) 70%)",
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.6, 2.4], opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.9, ease: "easeOut" }}
      />

      {particles.map((p) => (
        <motion.svg
          key={p.id}
          viewBox="0 0 20 20"
          className="absolute left-1/2 top-1/2"
          style={{
            width: p.size,
            height: p.size,
            marginLeft: -p.size / 2,
            marginTop: -p.size / 2,
            filter: glow
              ? `drop-shadow(0 0 6px ${p.color})`
              : `drop-shadow(0 2px 3px rgba(0,0,0,0.15))`,
          }}
          initial={{ x: 0, y: 0, rotate: 0, scale: 0 }}
          animate={{
            x: p.x,
            y: p.y,
            rotate: p.rotation,
            scale: [0, p.scale * 1.1, p.scale, 0],
          }}
          transition={{
            duration: 1.3,
            delay: p.delay,
            ease: [0.25, 0.46, 0.45, 0.94],
            scale: { times: [0, 0.2, 0.7, 1] },
          }}
        >
          <path d={STAR_PATH} fill={p.color} />
        </motion.svg>
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
    <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
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
            <StarBurstAnimation
              colors={celebration === "energy-burst" ? COSMIC_COLORS : WONDER_COLORS}
              glow={celebration === "energy-burst"}
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
