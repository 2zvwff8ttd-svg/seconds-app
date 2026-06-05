import type { CSSProperties } from "react";

type StarSpec = {
  x: number;
  y: number;
  r: number;
  opacity: number;
  delay: number;
  duration: number;
};

function seededRandom(seed: number) {
  let state = seed % 2147483646 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function buildStars(
  count: number,
  seed: number,
  radius: [number, number],
  opacity: [number, number],
): StarSpec[] {
  const rand = seededRandom(seed);
  const [rMin, rMax] = radius;
  const [oMin, oMax] = opacity;

  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    r: rMin + rand() * (rMax - rMin),
    opacity: oMin + rand() * (oMax - oMin),
    delay: rand() * 6,
    duration: 2.5 + rand() * 4.5,
  }));
}

const STARS_SMALL = buildStars(140, 42_001, [0.25, 0.55], [0.25, 0.55]);
const STARS_MID = buildStars(48, 42_002, [0.55, 0.95], [0.4, 0.75]);
const STARS_BRIGHT = buildStars(14, 42_003, [1, 1.65], [0.55, 0.9]);

function StarLayer({
  stars,
  className,
}: {
  stars: StarSpec[];
  className?: string;
}) {
  return (
    <svg
      className={`home-starfield-layer absolute inset-0 h-full w-full ${className ?? ""}`}
      aria-hidden
      preserveAspectRatio="none"
    >
      {stars.map((star, index) => (
        <circle
          key={index}
          cx={`${star.x}%`}
          cy={`${star.y}%`}
          r={star.r}
          className="home-star"
          fill="currentColor"
          style={
            {
              "--star-base-opacity": star.opacity,
              animationDelay: `${star.delay}s`,
              animationDuration: `${star.duration}s`,
            } as CSSProperties
          }
        />
      ))}
    </svg>
  );
}

/** ホーム（シャボン玉）用 — 星空背景 */
export function HomeStarfieldBackground() {
  return (
    <div className="home-starfield-bg" aria-hidden>
      <StarLayer stars={STARS_SMALL} className="home-starfield-layer--dim" />
      <StarLayer stars={STARS_MID} />
      <StarLayer stars={STARS_BRIGHT} className="home-starfield-layer--bright" />
    </div>
  );
}
