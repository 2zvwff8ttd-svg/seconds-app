export type BubblePlacement = {
  x: number;
  y: number;
  radius: number;
};

/** Relative sizes for 6 bubbles (viral is index 0 when viralFirst). */
const SIZE_VARIANTS = [1, 0.9, 0.95, 0.88, 0.93, 0.86] as const;

/**
 * 画面全体にバランスよく散らすゾーン。
 * index 0 = バイラル（上中央）。1〜5 は上下左右に分散（下寄りに偏らない）。
 */
const PLACEMENT_ZONES: ReadonlyArray<{
  cx: number;
  cy: number;
  spreadX: number;
  spreadY: number;
}> = [
  { cx: 0.5, cy: 0.13, spreadX: 0.18, spreadY: 0.08 },
  { cx: 0.78, cy: 0.26, spreadX: 0.14, spreadY: 0.12 },
  { cx: 0.22, cy: 0.3, spreadX: 0.14, spreadY: 0.12 },
  { cx: 0.74, cy: 0.44, spreadX: 0.14, spreadY: 0.13 },
  { cx: 0.26, cy: 0.48, spreadX: 0.14, spreadY: 0.13 },
  { cx: 0.52, cy: 0.56, spreadX: 0.16, spreadY: 0.1 },
];

function createSeededRandom(seed: number) {
  let state = seed % 2147483646 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

export function getCollisionRadius(radius: number): number {
  return radius;
}

function circlesOverlap(
  x1: number,
  y1: number,
  r1: number,
  x2: number,
  y2: number,
  r2: number,
  gap: number,
): boolean {
  const dx = x1 - x2;
  const dy = y1 - y2;
  const minDist = r1 + r2 + gap;
  return dx * dx + dy * dy < minDist * minDist;
}

function fitsInBounds(
  x: number,
  y: number,
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
): boolean {
  return (
    x - collisionRadius >= inset &&
    x + collisionRadius <= width - inset &&
    y - collisionRadius >= inset &&
    y + collisionRadius <= height - inset
  );
}

function sampleInZone(
  zone: (typeof PLACEMENT_ZONES)[number],
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
  random: () => number,
): { x: number; y: number } {
  const jitterX = (random() - 0.5) * 2 * zone.spreadX * width;
  const jitterY = (random() - 0.5) * 2 * zone.spreadY * height;
  const x = Math.min(
    width - collisionRadius - inset,
    Math.max(collisionRadius + inset, zone.cx * width + jitterX),
  );
  const y = Math.min(
    height - collisionRadius - inset,
    Math.max(collisionRadius + inset, zone.cy * height + jitterY),
  );
  return { x, y };
}

function zoneFallbackPosition(
  zone: (typeof PLACEMENT_ZONES)[number],
  radius: number,
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
): BubblePlacement {
  const x = Math.min(
    width - collisionRadius - inset,
    Math.max(collisionRadius + inset, zone.cx * width),
  );
  const y = Math.min(
    height - collisionRadius - inset,
    Math.max(collisionRadius + inset, zone.cy * height),
  );
  return { x, y, radius };
}

/**
 * Radii tuned for phone-first (375px). Scales up on tablets/desktop.
 */
export function getBubbleRadii(
  width: number,
  height: number,
  count: number,
  viralFirst = true,
): number[] {
  const minDim = Math.min(width, height);
  const isCompact = width <= 430;

  const baseRadius = minDim * (isCompact ? 0.16 : 0.12);
  const viralRadius = minDim * (isCompact ? 0.26 : 0.19);

  return Array.from({ length: count }, (_, i) => {
    const variant = SIZE_VARIANTS[i % SIZE_VARIANTS.length];
    if (viralFirst && i === 0) {
      return Math.round(viralRadius * variant);
    }
    return Math.round(baseRadius * variant);
  });
}

function getLayoutInsets(width: number) {
  const isCompact = width <= 430;
  return {
    edge: isCompact ? 8 : 12,
    gap: isCompact ? 12 : 16,
  };
}

/** 下寄り配置を避ける（バイラル以外）。cy が高すぎるほどスコアが下がる */
function placementScore(
  y: number,
  height: number,
  isViral: boolean,
): number {
  const normalizedY = y / height;
  if (isViral) return 1;
  if (normalizedY > 0.68) return 0.35;
  if (normalizedY > 0.58) return 0.65;
  return 1;
}

/**
 * Places N non-overlapping circles across the full viewport.
 */
export function computeBubbleLayout(
  width: number,
  height: number,
  count: number,
  options?: { viralFirst?: boolean },
): BubblePlacement[] {
  if (width <= 0 || height <= 0 || count <= 0) return [];

  const viralFirst = options?.viralFirst ?? true;
  const radii = getBubbleRadii(width, height, count, viralFirst);
  const { edge: inset, gap } = getLayoutInsets(width);

  const placed: BubblePlacement[] = [];
  const maxAttempts = 2400;
  const random = createSeededRandom(
    Math.round(width) * 997 + Math.round(height) * 991 + count * 17,
  );

  for (let i = 0; i < count; i++) {
    const radius = radii[i];
    const collisionRadius = getCollisionRadius(radius);
    const zone = PLACEMENT_ZONES[i % PLACEMENT_ZONES.length];
    const isViralSlot = viralFirst && i === 0;
    let position: BubblePlacement | null = null;
    let bestCandidate: BubblePlacement | null = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let x: number;
      let y: number;

      if (attempt < 1000) {
        ({ x, y } = sampleInZone(
          zone,
          collisionRadius,
          width,
          height,
          inset,
          random,
        ));
      } else {
        x = collisionRadius + inset + random() * (width - 2 * (collisionRadius + inset));
        y = collisionRadius + inset + random() * (height - 2 * (collisionRadius + inset));
      }

      if (!fitsInBounds(x, y, collisionRadius, width, height, inset)) continue;

      const overlaps = placed.some((p) =>
        circlesOverlap(
          x,
          y,
          collisionRadius,
          p.x,
          p.y,
          getCollisionRadius(p.radius),
          gap,
        ),
      );
      if (overlaps) continue;

      const yScore = placementScore(y, height, isViralSlot);
      const distScore = placed.reduce((min, p) => {
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        return Math.min(min, d);
      }, Number.POSITIVE_INFINITY);
      const score = yScore * 0.55 + Math.min(distScore / (collisionRadius * 3), 1) * 0.45;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = { x, y, radius };
      }

      if (score >= 0.85) {
        position = { x, y, radius };
        break;
      }
    }

    if (!position) {
      position =
        bestCandidate ??
        zoneFallbackPosition(zone, radius, collisionRadius, width, height, inset);
    }

    placed.push(position);
  }

  return placed;
}

/** Float distance scales slightly with viewport for larger bubbles. */
export function getFloatPresets(minDim: number) {
  const amp = Math.max(6, Math.round(minDim * 0.022));
  return [
    { floatX: `${amp}px`, floatY: `-${amp + 2}px`, durationX: "4.8s", durationY: "6.2s", delayX: "0s", delayY: "0.4s" },
    { floatX: `-${amp + 1}px`, floatY: `${amp}px`, durationX: "5.5s", durationY: "7s", delayX: "0.6s", delayY: "0s" },
    { floatX: `${amp - 1}px`, floatY: `${amp - 1}px`, durationX: "6s", durationY: "5.2s", delayX: "1.1s", delayY: "0.8s" },
    { floatX: `-${amp}px`, floatY: `-${amp}px`, durationX: "5.8s", durationY: "6.8s", delayX: "0.3s", delayY: "1.2s" },
    { floatX: `${amp + 2}px`, floatY: `-${amp - 2}px`, durationX: "7.2s", durationY: "5.6s", delayX: "1.5s", delayY: "0.2s" },
    { floatX: `-${amp - 2}px`, floatY: `${amp + 2}px`, durationX: "4.5s", durationY: "7.5s", delayX: "0.9s", delayY: "1.4s" },
  ] as const;
}
