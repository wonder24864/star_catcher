"use client";

/**
 * Three.js star field scene — Cosmic Explorer (P4-6) background.
 *
 * This file is the lazy-import target. It should ONLY be imported via
 * React.lazy in star-field.tsx, ensuring the Three.js bundle (~40kB gzip)
 * is never loaded for non-cosmic tiers.
 */

import { Canvas, extend } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import { AmbientLight } from "three";

// Register Three.js elements for JSX (required in @react-three/fiber v9+)
extend({ AmbientLight });

export default function StarFieldCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 1] }}
      style={{ width: "100%", height: "100%" }}
      dpr={[1, 1.5]}
      gl={{ antialias: false, alpha: true }}
    >
      <Stars
        radius={120}
        depth={60}
        count={300}
        factor={4}
        saturation={0.4}
        fade
        speed={0.4}
      />
      <ambientLight intensity={0.08} />
    </Canvas>
  );
}
