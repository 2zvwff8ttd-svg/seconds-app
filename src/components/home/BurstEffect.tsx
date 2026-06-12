"use client";

import type { CSSProperties } from "react";

function buildShards(count: number, baseDist: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const dist = baseDist + (i % 4) * 14;
    return {
      x: `${Math.cos(angle) * dist}px`,
      y: `${Math.sin(angle) * dist}px`,
      delay: `${i * 0.018}s`,
      size: i % 3 === 0 ? "h-3 w-3" : i % 3 === 1 ? "h-2.5 w-2.5" : "h-2 w-2",
    };
  });
}

const SHARDS = buildShards(12, 48);
const FULLSCREEN_SHARDS = buildShards(18, 56);

type BurstEffectProps = {
  size: number;
  variant?: "bubble" | "fullscreen";
};

export function BurstEffect({ size, variant = "bubble" }: BurstEffectProps) {
  const isFullscreen = variant === "fullscreen";
  const shards = isFullscreen ? FULLSCREEN_SHARDS : SHARDS;

  if (isFullscreen) {
    return (
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        aria-hidden
      >
        <span
          className="burst-fullscreen__swell absolute rounded-full border border-violet-200/40"
          style={{ width: size, height: size }}
        />
        {[0, 1, 2, 3].map((ring) => (
          <span
            key={ring}
            className="burst-fullscreen__ring absolute rounded-full border-2 border-violet-300/55"
            style={{
              width: size,
              height: size,
              animationDelay: `${ring * 0.07}s`,
            }}
          />
        ))}
        {shards.map((shard, i) => (
          <span
            key={i}
            className={`burst-shard--fullscreen absolute rounded-full ${shard.size}`}
            style={
              {
                "--shard-x": shard.x,
                "--shard-y": shard.y,
                animation: `burst-shard-fullscreen 0.62s cubic-bezier(0.22, 1, 0.36, 1) ${shard.delay} forwards`,
              } as CSSProperties
            }
          />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={`drop-${i}`}
            className="burst-fullscreen__droplet absolute rounded-full"
            style={
              {
                "--drop-angle": `${i * 60}deg`,
                animationDelay: `${0.04 + i * 0.035}s`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute inset-0 flex items-center justify-center"
      aria-hidden
    >
      <span
        className="absolute rounded-full border-2 border-white/60"
        style={{
          width: size,
          height: size,
          animation: "burst-ring 0.55s ease-out forwards",
        }}
      />
      {shards.map((shard, i) => (
        <span
          key={i}
          className="absolute h-2 w-2 rounded-full bg-white/70"
          style={
            {
              "--shard-x": shard.x,
              "--shard-y": shard.y,
              animation: `burst-shard 0.5s ease-out ${shard.delay} forwards`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
