/** ホーム（シャボン玉）用 — ノイズ入りダーク背景 */
export function HomeNoiseBackground() {
  return (
    <>
      <svg aria-hidden className="absolute h-0 w-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter
            id="seconds-home-grain-coarse"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.48"
              numOctaves="3"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 32 -14"
            />
          </filter>
          <filter
            id="seconds-home-grain-fine"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="1.05"
              numOctaves="2"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 28 -12"
            />
          </filter>
        </defs>
      </svg>
      <div className="home-noise-bg" aria-hidden>
        <div className="home-noise-grain home-noise-grain--coarse" />
        <div className="home-noise-grain home-noise-grain--fine" />
      </div>
    </>
  );
}
