"use client";

import type { CSSProperties } from "react";

const SHARDS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * Math.PI * 2;
  const dist = 48 + (i % 3) * 12;
  return {
    x: `${Math.cos(angle) * dist}px`,
    y: `${Math.sin(angle) * dist}px`,
    delay: `${i * 0.02}s`,
  };
});

export function BurstEffect({ size }: { size: number }) {
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
      {SHARDS.map((shard, i) => (
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
