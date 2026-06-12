"use client";

import type { CSSProperties } from "react";

/** Soft mist layers — expand outward as the camera advances (no light streaks). */
const FOG_LAYERS = [
  { size: 160, peak: 0.32, endScale: 6.5, delay: 0, x: -24, y: 18, duration: 3.1, rotate: -8 },
  { size: 220, peak: 0.4, endScale: 7.2, delay: 0.06, x: 32, y: -14, duration: 3.3, rotate: 12 },
  { size: 280, peak: 0.38, endScale: 7.8, delay: 0.12, x: -18, y: 28, duration: 3.35, rotate: -16 },
  { size: 340, peak: 0.45, endScale: 8.4, delay: 0.04, x: 44, y: 8, duration: 3.2, rotate: 6 },
  { size: 400, peak: 0.36, endScale: 9, delay: 0.18, x: -36, y: -22, duration: 3.4, rotate: -22 },
  { size: 460, peak: 0.42, endScale: 9.6, delay: 0.1, x: 20, y: 36, duration: 3.25, rotate: 18 },
  { size: 520, peak: 0.34, endScale: 10.5, delay: 0.22, x: -8, y: -32, duration: 3.38, rotate: -10 },
] as const;

const MIST_HALOS = [
  { size: "min(120vw, 520px)", delay: 0, duration: 3.4 },
  { size: "min(95vw, 420px)", delay: 0.14, duration: 3.2 },
  { size: "min(75vw, 340px)", delay: 0.28, duration: 3.0 },
] as const;

export function OpeningFirstPersonPass() {
  return (
    <div className="opening-fp-scene absolute inset-0 overflow-hidden" aria-hidden>
      <div className="opening-fp-ambient absolute inset-0" />

      <div className="opening-fp-camera absolute inset-0">
        {MIST_HALOS.map((halo, index) => (
          <div
            key={`halo-${index}`}
            className="opening-fp-mist-halo absolute left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 rounded-full"
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
                height: layer.size * 0.78,
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

        <div className="opening-fp-question-wrap pointer-events-none">
          <span className="opening-fp-question" aria-hidden>
            ?
          </span>
        </div>
      </div>

      <div className="opening-fp-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
