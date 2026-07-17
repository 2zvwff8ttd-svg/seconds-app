/**
 * Generate static assets for Phase 2b save/share compose:
 * - public/save-mask/starfield.png  (#010102 + seeded stars)
 * - public/save-mask/circle-alpha.png (white circle / black outside)
 *
 * Usage: node scripts/generate-save-mask-assets.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "save-mask");
const SIZE = 720;
const BG = { r: 1, g: 1, b: 2, alpha: 1 };

function seededRandom(seed) {
  let state = seed % 2147483646 || 1;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

function buildStars(count, seed, radius, opacity) {
  const rand = seededRandom(seed);
  const [rMin, rMax] = radius;
  const [oMin, oMax] = opacity;
  return Array.from({ length: count }, () => ({
    x: rand() * 100,
    y: rand() * 100,
    r: rMin + rand() * (rMax - rMin),
    opacity: oMin + rand() * (oMax - oMin),
  }));
}

const LAYERS = [
  buildStars(140, 42_001, [0.25, 0.55], [0.25, 0.55]),
  buildStars(48, 42_002, [0.55, 0.95], [0.4, 0.75]),
  buildStars(14, 42_003, [1, 1.65], [0.55, 0.9]),
];

function starfieldSvg() {
  const circles = LAYERS.flat()
    .map(
      (star) =>
        `<circle cx="${((star.x / 100) * SIZE).toFixed(2)}" cy="${((star.y / 100) * SIZE).toFixed(2)}" r="${star.r.toFixed(2)}" fill="rgb(230,235,255)" fill-opacity="${star.opacity.toFixed(3)}" />`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="100%" height="100%" fill="#010102"/>${circles}</svg>`;
}

function circleAlphaSvg() {
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const r = SIZE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="100%" height="100%" fill="#000"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff"/></svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const starfield = await sharp(Buffer.from(starfieldSvg()))
    .png()
    .toBuffer();
  const circle = await sharp(Buffer.from(circleAlphaSvg()))
    .png()
    .toBuffer();

  // Ensure opaque black background pixels (no transparency in starfield).
  const starfieldOpaque = await sharp(starfield)
    .flatten({ background: BG })
    .png()
    .toBuffer();

  await writeFile(path.join(OUT_DIR, "starfield.png"), starfieldOpaque);
  await writeFile(path.join(OUT_DIR, "circle-alpha.png"), circle);
  console.log(`Wrote ${OUT_DIR}/starfield.png and circle-alpha.png (${SIZE}x${SIZE})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
