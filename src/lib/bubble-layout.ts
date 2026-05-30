export type BubblePlacement = {
  x: number;
  y: number;
  radius: number;
};

/** Relative sizes for 6 bubbles (viral is index 0 when viralFirst). */
const SIZE_VARIANTS = [1, 0.9, 0.95, 0.88, 0.93, 0.86] as const;

function createSeededRandom(seed: number) {
  let state = seed % 2147483646 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
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
  radius: number,
  width: number,
  height: number,
  inset: number,
): boolean {
  return (
    x - radius >= inset &&
    x + radius <= width - inset &&
    y - radius >= inset &&
    y + radius <= height - inset
  );
}

/**
 * Radii tuned for phone-first (375px). Scales up on tablets/desktop.
 * At 375×~520 field: viral ~78px, others ~54–68px diameter range.
 */
export function getBubbleRadii(
  width: number,
  height: number,
  count: number,
  viralFirst = true,
): number[] {
  const minDim = Math.min(width, height);
  const isCompact = width <= 430;

  const baseRadius = minDim * (isCompact ? 0.178 : 0.13);
  const viralRadius = minDim * (isCompact ? 0.222 : 0.165);

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
    edge: isCompact ? 2 : 8,
    gap: isCompact ? 5 : 10,
  };
}

/**
 * Places N non-overlapping circles inside a rectangle using rejection sampling.
 * First bubble (viral top) gets a larger radius and is pinned toward the upper area.
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
  const maxAttempts = 1500;
  const random = createSeededRandom(
    Math.round(width) * 997 + Math.round(height) * 991 + count * 17,
  );

  for (let i = 0; i < count; i++) {
    const radius = radii[i];
    let position: BubblePlacement | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let x: number;
      let y: number;

      if (viralFirst && i === 0) {
        x = width * (0.32 + random() * 0.36);
        y = height * (0.12 + random() * 0.28);
      } else {
        x = radius + inset + random() * (width - 2 * (radius + inset));
        y = radius + inset + random() * (height - 2 * (radius + inset));
      }

      if (!fitsInBounds(x, y, radius, width, height, inset)) continue;

      const overlaps = placed.some((p) =>
        circlesOverlap(x, y, radius, p.x, p.y, p.radius, gap),
      );
      if (overlaps) continue;

      position = { x, y, radius };
      break;
    }

    if (!position) {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const cx = width / 2;
      const cy = height / 2;
      const orbit = Math.min(width, height) * 0.36 + i * 4;
      position = {
        x: cx + Math.cos(angle) * orbit,
        y: cy + Math.sin(angle) * orbit,
        radius,
      };
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
