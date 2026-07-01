export type BubblePlacement = {
  x: number;
  y: number;
  radius: number;
};

/** Relative sizes for 6 bubbles (viral is index 0 when viralFirst). */
const SIZE_VARIANTS = [1, 0.9, 0.95, 0.88, 0.93, 0.86] as const;

type GridCell = { row: number; col: number };

function createSeededRandom(seed: number) {
  let state = seed % 2147483646 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function getCollisionRadius(radius: number, frameScale = 1): number {
  if (frameScale <= 1) return radius;
  // Star/heart/diamond masks fill the square bbox (wider than an inscribed circle).
  const excess = frameScale - 1;
  return radius * (1 + 0.08 + excess * 0.12);
}

/** CSS float animation peak offset + shaped-mask drop-shadow bleed. */
export function getBubbleLayoutMargin(
  minDim: number,
  frameScale = 1,
): number {
  const floatAmp = Math.max(6, Math.round(minDim * 0.022));
  // Float animation only — drop-shadow bleeds overlap visually less than body overlap.
  const shadowBleed = frameScale > 1 ? 3 + (frameScale - 1) * 3 : 2;
  return floatAmp + shadowBleed;
}

function effectiveCollisionRadius(
  radius: number,
  frameScale: number,
  layoutMargin: number,
): number {
  return getCollisionRadius(radius, frameScale) + layoutMargin;
}

/** Box edge + small float guard for separation pushes. */
function layoutSeparationRadius(
  radius: number,
  _frameScale: number,
  _minDim: number,
): number {
  return radius + 4;
}

function clampBubbleCenter(
  x: number,
  y: number,
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
): { x: number; y: number } {
  return {
    x: clamp(x, collisionRadius + inset, width - collisionRadius - inset),
    y: clamp(y, collisionRadius + inset, height - collisionRadius - inset),
  };
}

/**
 * Push overlapping bubbles apart after grid placement.
 * Grid cells are closer than large shaped bubbles need; the fallback path also
 * accepts cell-center positions that already overlap neighbours.
 */
function separateOverlappingPlacements(
  placed: BubblePlacement[],
  frameScales: number[] | undefined,
  width: number,
  height: number,
  inset: number,
  gap: number,
  minDim: number,
  pushStrength = 1,
): boolean {
  if (placed.length < 2) return false;

  let anyOverlap = false;
  const maxIterations = 200;

  for (let iter = 0; iter < maxIterations; iter++) {
    let movedThisRound = false;

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!;
        const b = placed[j]!;
        const scaleA = frameScales?.[i] ?? 1;
        const scaleB = frameScales?.[j] ?? 1;
        const rA = layoutSeparationRadius(a.radius, scaleA, minDim);
        const rB = layoutSeparationRadius(b.radius, scaleB, minDim);
        const minDist = rA + rB + pairCollisionGap(gap, scaleA, scaleB);

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        let ux = 1;
        let uy = 0;
        if (dist > 1e-3) {
          ux = dx / dist;
          uy = dy / dist;
        } else {
          const angle = ((i * 7 + j * 13 + iter) % 360) * (Math.PI / 180);
          ux = Math.cos(angle);
          uy = Math.sin(angle);
          dist = 1e-3;
        }

        if (dist >= minDist) continue;
        anyOverlap = true;

        const overlap = (minDist - dist) * pushStrength;
        const totalR = rA + rB;
        const moveA = overlap * (rB / totalR);
        const moveB = overlap * (rA / totalR);

        let nextA = clampBubbleCenter(
          a.x - ux * moveA,
          a.y - uy * moveA,
          rA,
          width,
          height,
          inset,
        );
        let nextB = clampBubbleCenter(
          b.x + ux * moveB,
          b.y + uy * moveB,
          rB,
          width,
          height,
          inset,
        );

        const aStuck = nextA.x === a.x && nextA.y === a.y;
        const bStuck = nextB.x === b.x && nextB.y === b.y;

        if (aStuck && bStuck) {
          const perpX = -uy;
          const perpY = ux;
          const wiggle = overlap * 0.35;
          nextA = clampBubbleCenter(
            a.x + perpX * wiggle,
            a.y + perpY * wiggle,
            rA,
            width,
            height,
            inset,
          );
          nextB = clampBubbleCenter(
            b.x - perpX * wiggle,
            b.y - perpY * wiggle,
            rB,
            width,
            height,
            inset,
          );
        } else if (aStuck && !bStuck) {
          nextB = clampBubbleCenter(
            b.x + ux * moveB * 1.85,
            b.y + uy * moveB * 1.85,
            rB,
            width,
            height,
            inset,
          );
        } else if (bStuck && !aStuck) {
          nextA = clampBubbleCenter(
            a.x - ux * moveA * 1.85,
            a.y - uy * moveA * 1.85,
            rA,
            width,
            height,
            inset,
          );
        }

        const moved =
          nextA.x !== a.x ||
          nextA.y !== a.y ||
          nextB.x !== b.x ||
          nextB.y !== b.y;
        if (!moved) continue;

        movedThisRound = true;
        placed[i] = { ...a, x: nextA.x, y: nextA.y };
        placed[j] = { ...b, x: nextB.x, y: nextB.y };
      }
    }

    if (!movedThisRound) break;
  }

  return anyOverlap;
}

function placementsOverlap(
  placed: BubblePlacement[],
  frameScales: number[] | undefined,
  minDim: number,
  gap: number,
): Array<{ i: number; j: number }> {
  const pairs: Array<{ i: number; j: number }> = [];
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i]!;
      const b = placed[j]!;
      const scaleA = frameScales?.[i] ?? 1;
      const scaleB = frameScales?.[j] ?? 1;
      const rA = layoutSeparationRadius(a.radius, scaleA, minDim);
      const rB = layoutSeparationRadius(b.radius, scaleB, minDim);
      const minDist = rA + rB + pairCollisionGap(gap, scaleA, scaleB);
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (dist < minDist) pairs.push({ i, j });
    }
  }
  return pairs;
}

/** Last resort: shrink only bubbles still overlapping after separation (max ~6%). */
function minimallyShrinkRemainingOverlaps(
  placed: BubblePlacement[],
  originalRadii: number[],
  frameScales: number[] | undefined,
  minDim: number,
  gap: number,
): void {
  const minScale = 0.97;

  for (let round = 0; round < 24; round++) {
    const pairs = placementsOverlap(placed, frameScales, minDim, gap);
    if (pairs.length === 0) return;

    for (const { i, j } of pairs) {
      const shrinkIndex =
        placed[i]!.radius >= placed[j]!.radius ? i : j;
      const floor = Math.round(originalRadii[shrinkIndex]! * minScale);
      placed[shrinkIndex] = {
        ...placed[shrinkIndex]!,
        radius: Math.max(
          floor,
          Math.round(placed[shrinkIndex]!.radius * 0.985),
        ),
      };
    }
  }
}

function sampleAnywhereInBounds(
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
  random: () => number,
): { x: number; y: number } {
  const minX = collisionRadius + inset;
  const maxX = width - collisionRadius - inset;
  const minY = collisionRadius + inset;
  const maxY = height - collisionRadius - inset;
  return {
    x: minX + random() * Math.max(0, maxX - minX),
    y: minY + random() * Math.max(0, maxY - minY),
  };
}

function pairCollisionGap(
  baseGap: number,
  frameScaleA: number,
  frameScaleB: number,
): number {
  const boost = Math.max(frameScaleA, frameScaleB, 1);
  return baseGap + Math.max(0, boost - 1) * 18;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** バブル数と画面向きからグリッド形状を決める（縦長画面は行を多めに） */
function getGridShape(
  count: number,
  width: number,
  height: number,
): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };

  const isPortrait = height >= width;

  if (count === 6) {
    return isPortrait ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
  }
  if (count === 5) {
    return isPortrait ? { cols: 2, rows: 3 } : { cols: 3, rows: 2 };
  }
  if (count === 4) {
    return { cols: 2, rows: 2 };
  }
  if (count === 3) {
    return isPortrait ? { cols: 1, rows: 3 } : { cols: 3, rows: 1 };
  }
  if (count === 2) {
    return isPortrait ? { cols: 1, rows: 2 } : { cols: 2, rows: 1 };
  }

  const cols = isPortrait
    ? Math.max(1, Math.min(2, count))
    : Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.ceil(count / cols);
  return { cols, rows };
}

function listGridCells(cols: number, rows: number): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({ row, col });
    }
  }
  return cells;
}

/** セル数よりバブルが少ないとき、行ごとに均等にセルを選ぶ */
function pickSpreadCells(
  cells: GridCell[],
  count: number,
  rows: number,
  random: () => number,
): GridCell[] {
  if (count >= cells.length) return cells.slice(0, count);

  const byRow: GridCell[][] = Array.from({ length: rows }, () => []);
  for (const cell of cells) {
    byRow[cell.row].push(cell);
  }

  const picked: GridCell[] = [];
  let rowCursor = 0;

  while (picked.length < count) {
    const row = rowCursor % rows;
    const rowCells = byRow[row];
    if (rowCells.length > 0) {
      const index = Math.floor(random() * rowCells.length);
      picked.push(rowCells.splice(index, 1)[0]);
    }
    rowCursor++;
    if (rowCursor > rows * count * 2) break;
  }

  return picked.length === count ? picked : cells.slice(0, count);
}

/** バイラルは最上段中央セル、他は残りセルをシャッフルして割り当て */
function assignGridCells(
  count: number,
  cols: number,
  rows: number,
  viralFirst: boolean,
  random: () => number,
): GridCell[] {
  const allCells = listGridCells(cols, rows);
  const pool = pickSpreadCells(allCells, count, rows, random);
  const assignments: GridCell[] = new Array(count);

  if (viralFirst && count > 0) {
    const viralCell: GridCell = { row: 0, col: Math.floor(cols / 2) };
    const hasViralCell = pool.some(
      (cell) => cell.row === viralCell.row && cell.col === viralCell.col,
    );
    assignments[0] = hasViralCell
      ? viralCell
      : pool.reduce((best, cell) => (cell.row < best.row ? cell : best), pool[0]);

    const rest = pool.filter(
      (cell) =>
        cell.row !== assignments[0].row || cell.col !== assignments[0].col,
    );
    const shuffled = shuffle(rest, random);
    for (let i = 1; i < count; i++) {
      assignments[i] = shuffled[i - 1] ?? pool[i % pool.length];
    }
    return assignments;
  }

  const shuffled = shuffle(pool, random);
  for (let i = 0; i < count; i++) {
    assignments[i] = shuffled[i];
  }
  return assignments;
}

function getCellMetrics(
  cell: GridCell,
  cols: number,
  rows: number,
  width: number,
  height: number,
  inset: number,
) {
  const usableW = width - inset * 2;
  const usableH = height - inset * 2;
  const cellW = usableW / cols;
  const cellH = usableH / rows;
  const cx = inset + (cell.col + 0.5) * cellW;
  const cy = inset + (cell.row + 0.5) * cellH;
  return { cx, cy, cellW, cellH };
}

function sampleInCell(
  cell: GridCell,
  cols: number,
  rows: number,
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
  random: () => number,
  offsetRatio = 0.38,
): { x: number; y: number } {
  const { cx, cy, cellW, cellH } = getCellMetrics(
    cell,
    cols,
    rows,
    width,
    height,
    inset,
  );

  const maxOffsetX = Math.max(
    0,
    cellW * offsetRatio - collisionRadius * 0.25,
  );
  const maxOffsetY = Math.max(
    0,
    cellH * offsetRatio - collisionRadius * 0.25,
  );
  const ox = (random() - 0.5) * 2 * maxOffsetX;
  let oy = (random() - 0.5) * 2 * maxOffsetY;
  if (cell.row === rows - 1) {
    oy -= cellH * 0.1;
  }

  const x = clamp(
    cx + ox,
    collisionRadius + inset,
    width - collisionRadius - inset,
  );
  const y = clamp(
    cy + oy,
    collisionRadius + inset,
    height - collisionRadius - inset,
  );

  return { x, y };
}

function cellCenterPosition(
  cell: GridCell,
  cols: number,
  rows: number,
  radius: number,
  collisionRadius: number,
  width: number,
  height: number,
  inset: number,
): BubblePlacement {
  const { cx, cy, cellH } = getCellMetrics(cell, cols, rows, width, height, inset);
  const targetY =
    cell.row === rows - 1 ? cy - cellH * 0.08 : cy;
  const x = clamp(
    cx,
    collisionRadius + inset,
    width - collisionRadius - inset,
  );
  const y = clamp(
    targetY,
    collisionRadius + inset,
    height - collisionRadius - inset,
  );
  return { x, y, radius };
}

/**
 * Radii tuned for phone-first (375px). Scales up on tablets/desktop.
 * グリッドセル内に収まるよう上限を設けつつ、従来より一回り大きめ。
 */
export function getBubbleRadii(
  width: number,
  height: number,
  count: number,
  viralFirst = true,
): number[] {
  const minDim = Math.min(width, height);
  const isCompact = width <= 430;
  const { edge: inset } = getLayoutInsets(width);
  const { cols, rows } = getGridShape(count, width, height);

  const usableW = width - inset * 2;
  const usableH = height - inset * 2;
  const cellMin = Math.min(usableW / cols, usableH / rows);
  const maxBaseRadius = cellMin * 0.41;
  const maxViralRadius = cellMin * 0.48;

  const baseRadius = Math.min(
    minDim * (isCompact ? 0.19 : 0.15),
    maxBaseRadius,
  );
  const viralRadius = Math.min(
    minDim * (isCompact ? 0.29 : 0.22),
    maxViralRadius,
  );

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

/**
 * グリッド分割 + セル内ランダム配置で、利用可能エリア全体に均等分散する。
 */
export function computeBubbleLayout(
  width: number,
  height: number,
  count: number,
  options?: { viralFirst?: boolean; frameScales?: number[] },
): BubblePlacement[] {
  if (width <= 0 || height <= 0 || count <= 0) return [];

  const viralFirst = options?.viralFirst ?? true;
  const frameScales = options?.frameScales;
  const baseRadii = getBubbleRadii(width, height, count, viralFirst);
  const { edge: inset, gap } = getLayoutInsets(width);
  const { cols, rows } = getGridShape(count, width, height);
  const minDim = Math.min(width, height);

  const collisionRadiusFor = (radius: number, frameScale: number) =>
    effectiveCollisionRadius(
      radius,
      frameScale,
      getBubbleLayoutMargin(minDim, frameScale),
    );

  const overlapsPlaced = (
    x: number,
    y: number,
    collisionRadius: number,
    frameScale: number,
    placedIndex: number,
  ): boolean =>
    Object.entries(placed).some(([idx, p]) => {
      if (!p || Number(idx) === placedIndex) return false;
      const otherScale = frameScales?.[Number(idx)] ?? 1;
      return circlesOverlap(
        x,
        y,
        collisionRadius,
        p.x,
        p.y,
        collisionRadiusFor(p.radius, otherScale),
        pairCollisionGap(gap, frameScale, otherScale),
      );
    });

  const random = createSeededRandom(
    Math.round(width) * 997 + Math.round(height) * 991 + count * 17,
  );
  const cellAssignments = assignGridCells(
    count,
    cols,
    rows,
    viralFirst,
    random,
  );

  const layoutRadii = baseRadii.map((baseR, i) => {
    const frameScale = frameScales?.[i] ?? 1;
    return Math.round(baseR * frameScale);
  });
  const hasShapedBubbles = layoutRadii.some(
    (_, i) => (frameScales?.[i] ?? 1) > 1,
  );

  const separationInset = hasShapedBubbles ? Math.max(4, inset - 4) : inset;
  const placed: Array<BubblePlacement | null> = new Array(count).fill(null);
  const placeOrder = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => layoutRadii[b]! - layoutRadii[a]!,
  );
  const maxAttemptsPerBubble = hasShapedBubbles ? 180 : 120;

  for (const i of placeOrder) {
    const frameScale = frameScales?.[i] ?? 1;
    const radius = layoutRadii[i]!;
    const collisionRadius = hasShapedBubbles
      ? layoutSeparationRadius(radius, frameScale, minDim)
      : collisionRadiusFor(radius, frameScale);
    const cell = cellAssignments[i];
    let position: BubblePlacement | null = null;

    for (let attempt = 0; attempt < maxAttemptsPerBubble; attempt++) {
      const offsetRatio = attempt < 50 ? 0.42 : attempt < 90 ? 0.28 : 0.14;
      const useGlobal = hasShapedBubbles || frameScale > 1 || attempt >= 90;
      const { x, y } = useGlobal
        ? sampleAnywhereInBounds(
            collisionRadius,
            width,
            height,
            inset,
            random,
          )
        : sampleInCell(
              cell,
              cols,
              rows,
              collisionRadius,
              width,
              height,
              inset,
              random,
              offsetRatio,
            );

      if (!fitsInBounds(x, y, collisionRadius, width, height, inset)) {
        continue;
      }

      if (overlapsPlaced(x, y, collisionRadius, frameScale, i)) {
        continue;
      }

      position = { x, y, radius };
      break;
    }

    if (!position) {
      position = cellCenterPosition(
        cell,
        cols,
        rows,
        radius,
        collisionRadius,
        width,
        height,
        inset,
      );

      if (overlapsPlaced(position.x, position.y, collisionRadius, frameScale, i)) {
        const nudges = [
          { dx: gap, dy: 0 },
          { dx: -gap, dy: 0 },
          { dx: 0, dy: -gap },
          { dx: 0, dy: gap },
          { dx: gap, dy: -gap },
          { dx: -gap, dy: -gap },
          { dx: gap * 2, dy: 0 },
          { dx: -gap * 2, dy: 0 },
          { dx: 0, dy: gap * 2 },
          { dx: 0, dy: -gap * 2 },
          { dx: gap * 3, dy: -gap },
          { dx: -gap * 3, dy: gap },
        ];
        for (const nudge of nudges) {
          const nudged = clampBubbleCenter(
            position.x + nudge.dx,
            position.y + nudge.dy,
            collisionRadius,
            width,
            height,
            inset,
          );
          if (
            !overlapsPlaced(
              nudged.x,
              nudged.y,
              collisionRadius,
              frameScale,
              i,
            )
          ) {
            position = { ...position, x: nudged.x, y: nudged.y };
            break;
          }
        }
      }
    }

    placed[i] = position;
  }

  const resolved = placed as BubblePlacement[];
  const originalRadii = resolved.map((p) => p.radius);

  for (let round = 0; round < 60; round++) {
    const push = round < 15 ? 1.25 : round < 35 ? 1.75 : 2.8;
      separateOverlappingPlacements(
      resolved,
      frameScales,
      width,
      height,
      separationInset,
      gap,
      minDim,
      push,
    );
    if (placementsOverlap(resolved, frameScales, minDim, gap).length === 0) {
      return resolved;
    }
  }

  if (placementsOverlap(resolved, frameScales, minDim, gap).length > 0) {
    minimallyShrinkRemainingOverlaps(
      resolved,
      originalRadii,
      frameScales,
      minDim,
      gap,
    );
    for (let round = 0; round < 30; round++) {
      separateOverlappingPlacements(
        resolved,
        frameScales,
        width,
        height,
        separationInset,
        gap,
        minDim,
        1.6,
      );
      if (placementsOverlap(resolved, frameScales, minDim, gap).length === 0) {
        break;
      }
    }
  }

  return resolved;
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
