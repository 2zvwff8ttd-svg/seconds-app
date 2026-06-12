"use client";

import type { CSSProperties } from "react";
import { FogQuestionMark } from "./FogQuestionMark";

/** Lightweight ambient fog — transform/opacity only (fixed blur). */
const FOG_LAYERS = [
  { size: 220, peak: 0.34, endScale: 7.2, delay: 0, x: -22, y: 14, duration: 3.9, rotate: -8 },
  { size: 300, peak: 0.38, endScale: 8.2, delay: 0.1, x: 30, y: -10, duration: 4, rotate: 10 },
  { size: 380, peak: 0.36, endScale: 9.2, delay: 0.06, x: -34, y: -18, duration: 3.95, rotate: -12 },
  { size: 460, peak: 0.3, endScale: 10.2, delay: 0.18, x: 18, y: 26, duration: 4.05, rotate: 6 },
] as const;

const MIST_HALOS = [
  { size: "min(105vw, 460px)", delay: 0, duration: 4 },
  { size: "min(82vw, 360px)", delay: 0.22, duration: 3.85 },
] as const;

export function OpeningFirstPersonPass() {
  return (
    <div className="opening-fp-scene absolute inset-0 overflow-hidden" aria-hidden>
      <div className="opening-fp-ambient absolute inset-0" />

      <div className="opening-fp-camera absolute inset-0">
        {MIST_HALOS.map((halo, index) => (
          <div
            key={`halo-${index}`}
            className="opening-fp-mist-halo absolute left-1/2 top-[48%] rounded-full"
            style={
              {
                width: halo.size,
                height: halo.size,
                "--fp-delay": `${halo.delay}s`,
                "--fp-duration": `${halo.duration}s`,
              } as CSSProperties
            }
          />
        ))}

        {FOG_LAYERS.map((layer, index) => (
          <div
            key={`fog-${index}`}
            className="opening-fp-fog-layer absolute left-1/2 top-[48%] rounded-full"
            style={
              {
                width: layer.size,
                height: layer.size * 0.8,
                "--fp-peak": layer.peak,
                "--fp-end-scale": layer.endScale,
                "--fp-x": `${layer.x}px`,
                "--fp-y": `${layer.y}px`,
                "--fp-delay": `${layer.delay}s`,
                "--fp-duration": `${layer.duration}s`,
                "--fp-rotate": `${layer.rotate}deg`,
              } as CSSProperties
            }
          />
        ))}

        <FogQuestionMark mode="pass" />
      </div>

      <div className="opening-fp-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
