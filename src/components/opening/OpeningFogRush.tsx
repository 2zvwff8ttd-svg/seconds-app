"use client";

import type { CSSProperties } from "react";

const FOG_WISPS = [
  { size: 140, delay: 0, duration: 2.1, rotate: 0 },
  { size: 200, delay: 0.06, duration: 2.3, rotate: 18 },
  { size: 260, delay: 0.12, duration: 2.45, rotate: -12 },
  { size: 320, delay: 0.04, duration: 2.2, rotate: 32 },
  { size: 380, delay: 0.18, duration: 2.55, rotate: -24 },
  { size: 440, delay: 0.1, duration: 2.35, rotate: 8 },
  { size: 500, delay: 0.22, duration: 2.5, rotate: -36 },
] as const;

export function OpeningFogRush() {
  return (
    <div className="opening-fog-rush absolute inset-0 overflow-hidden" aria-hidden>
      <div className="opening-fog-vignette absolute inset-0" />

      <div className="opening-fog-tunnel absolute left-1/2 top-1/2 h-[min(90vw,420px)] w-[min(90vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full" />

      {FOG_WISPS.map((wisp, index) => (
        <div
          key={`wisp-${index}`}
          className="opening-fog-wisp absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={
            {
              width: wisp.size,
              height: wisp.size * 0.72,
              "--fog-delay": `${wisp.delay}s`,
              "--fog-duration": `${wisp.duration}s`,
              "--fog-rotate": `${wisp.rotate}deg`,
            } as CSSProperties
          }
        />
      ))}

      <div className="opening-fog-depth absolute inset-0" />
    </div>
  );
}
