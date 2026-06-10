"use client";

const FOG_WISPS = [
  { size: 140, delay: 0, duration: 2.1, rotate: 0 },
  { size: 200, delay: 0.06, duration: 2.3, rotate: 18 },
  { size: 260, delay: 0.12, duration: 2.45, rotate: -12 },
  { size: 320, delay: 0.04, duration: 2.2, rotate: 32 },
  { size: 380, delay: 0.18, duration: 2.55, rotate: -24 },
  { size: 440, delay: 0.1, duration: 2.35, rotate: 8 },
  { size: 500, delay: 0.22, duration: 2.5, rotate: -36 },
] as const;

const SPEED_STREAKS = [
  { angle: 0, delay: 0.05, width: 3 },
  { angle: 45, delay: 0.12, width: 2 },
  { angle: 90, delay: 0.02, width: 4 },
  { angle: 135, delay: 0.18, width: 2 },
  { angle: 180, delay: 0.08, width: 3 },
  { angle: 225, delay: 0.15, width: 2 },
  { angle: 270, delay: 0.04, width: 4 },
  { angle: 315, delay: 0.2, width: 2 },
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
            } as React.CSSProperties
          }
        />
      ))}

      {SPEED_STREAKS.map((streak, index) => (
        <div
          key={`streak-${index}`}
          className="opening-fog-streak absolute left-1/2 top-1/2 origin-center"
          style={
            {
              "--streak-angle": `${streak.angle}deg`,
              "--streak-delay": `${streak.delay}s`,
              "--streak-width": `${streak.width}px`,
            } as React.CSSProperties
          }
        />
      ))}

      <div className="opening-fog-depth absolute inset-0" />
    </div>
  );
}
