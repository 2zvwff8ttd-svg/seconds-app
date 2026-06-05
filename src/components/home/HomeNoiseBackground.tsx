/** ホーム（シャボン玉）用 — ノイズ入りダーク背景 */
export function HomeNoiseBackground() {
  return (
    <>
      <svg aria-hidden className="absolute h-0 w-0" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter
            id="seconds-home-grain"
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            filterUnits="objectBoundingBox"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.72"
              numOctaves="4"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              in="noise"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -9"
              result="contrast"
            />
            <feBlend in="contrast" in2="SourceGraphic" mode="multiply" />
          </filter>
        </defs>
      </svg>
      <div className="home-noise-bg" aria-hidden>
        <div className="home-noise-grain" />
      </div>
    </>
  );
}
