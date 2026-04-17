"use client";

/**
 * Ambient background for the wonder tier (Primary 1-3).
 *
 * Mirrors the <StarField /> pattern: renders nothing for non-matching tiers,
 * fixed pointer-events-none overlay at `-z-10` so it sits behind content.
 * Uses only CSS transforms + framer-motion (no Three.js) to keep the bundle
 * light for young-learner devices.
 *
 * Elements:
 * - Pastel gradient wash
 * - Large soft clouds drifting slowly horizontally
 * - Tiny sparkles that twinkle in place
 */

import { motion } from "framer-motion";
import { useTier } from "@/components/providers/grade-tier-provider";

// Cloud positions (top, left) + drift duration — hand-tuned for pleasant density.
// Each tint has a dark-mode pair so clouds feel soft at night instead of
// washed-out pastel over a dark background.
const CLOUDS = [
  {
    top: "8%",
    left: "-12%",
    size: 220,
    duration: 48,
    tint: "bg-pink-200/50 dark:bg-pink-900/30",
  },
  {
    top: "22%",
    left: "65%",
    size: 180,
    duration: 56,
    tint: "bg-violet-200/50 dark:bg-violet-900/30",
  },
  {
    top: "55%",
    left: "-8%",
    size: 240,
    duration: 64,
    tint: "bg-yellow-100/55 dark:bg-amber-900/25",
  },
  {
    top: "70%",
    left: "55%",
    size: 200,
    duration: 52,
    tint: "bg-sky-200/50 dark:bg-sky-900/30",
  },
  {
    top: "38%",
    left: "30%",
    size: 160,
    duration: 60,
    tint: "bg-rose-100/55 dark:bg-rose-900/25",
  },
];

// Sparkle positions as % so they scatter across the viewport. Dark pairs keep
// them visible on a dark background but toned down.
const SPARKLES = [
  { top: "12%", left: "22%", delay: 0, color: "bg-yellow-300 dark:bg-yellow-400/80" },
  { top: "18%", left: "78%", delay: 0.4, color: "bg-pink-300 dark:bg-pink-400/80" },
  { top: "34%", left: "48%", delay: 0.8, color: "bg-violet-300 dark:bg-violet-400/80" },
  { top: "52%", left: "14%", delay: 1.2, color: "bg-sky-300 dark:bg-sky-400/80" },
  { top: "64%", left: "72%", delay: 1.6, color: "bg-rose-300 dark:bg-rose-400/80" },
  { top: "80%", left: "38%", delay: 2.0, color: "bg-amber-300 dark:bg-amber-400/80" },
  { top: "88%", left: "85%", delay: 2.4, color: "bg-fuchsia-300 dark:bg-fuchsia-400/80" },
];

export function WonderField() {
  const { tier } = useTier();
  if (tier !== "wonder") return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Base pastel wash */}
      <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-fuchsia-50 to-violet-50 dark:from-rose-950/20 dark:via-fuchsia-950/20 dark:to-violet-950/20" />

      {/* Drifting clouds */}
      {CLOUDS.map((c, i) => (
        <motion.div
          key={`cloud-${i}`}
          className={`absolute rounded-full blur-3xl ${c.tint}`}
          style={{
            top: c.top,
            left: c.left,
            width: c.size,
            height: c.size * 0.6,
          }}
          animate={{
            x: ["0%", "20%", "0%"],
            y: ["0%", "-6%", "0%"],
          }}
          transition={{
            duration: c.duration,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Twinkling sparkles */}
      {SPARKLES.map((s, i) => (
        <motion.div
          key={`sparkle-${i}`}
          className={`absolute h-2 w-2 rounded-full ${s.color} shadow-[0_0_8px_currentColor]`}
          style={{ top: s.top, left: s.left }}
          animate={{
            scale: [0.6, 1.3, 0.6],
            opacity: [0.25, 0.95, 0.25],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "easeInOut",
            delay: s.delay,
          }}
        />
      ))}
    </div>
  );
}
