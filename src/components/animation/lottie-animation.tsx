"use client";

/**
 * Lottie animation component with automatic tier-based asset loading.
 *
 * Loads JSON from `public/lottie/{tier}/{name}.json`. Falls back to the
 * `fallback` prop when the JSON is missing (expected for Sprint 19 — real
 * Lottie assets will be added in later iterations).
 */

import { useEffect, useState, type ReactNode } from "react";
import Lottie from "lottie-react";
import { useTier, type GradeTier } from "@/components/providers/grade-tier-provider";

export interface LottieAnimationProps {
  /** Asset name (without .json), e.g. "celebration", "loading" */
  name: string;
  /** Override tier from context */
  tier?: GradeTier;
  /** Rendered when JSON fails to load */
  fallback?: ReactNode;
  /** @default true */
  loop?: boolean;
  /** @default true */
  autoplay?: boolean;
  className?: string;
}

export function LottieAnimation({
  name,
  tier: tierOverride,
  fallback = null,
  loop = true,
  autoplay = true,
  className,
}: LottieAnimationProps) {
  const { tier: contextTier } = useTier();
  const tier = tierOverride ?? contextTier;

  const [animationData, setAnimationData] = useState<object | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Reset state when tier/name changes to avoid stale data flash
    setAnimationData(null);
    setFailed(false);

    fetch(`/lottie/${tier}/${name}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: object) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [tier, name]);

  // JSON not yet loaded and not failed — show nothing (loading)
  if (!animationData && !failed) return null;

  // JSON failed to load — use fallback
  if (failed || !animationData) return <>{fallback}</>;

  return (
    <Lottie
      animationData={animationData}
      loop={loop}
      autoPlay={autoplay}
      className={className}
    />
  );
}
