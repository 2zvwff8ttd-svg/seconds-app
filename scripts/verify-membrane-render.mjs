/**
 * Headless render check: inset box-shadow vs SVG stroke membrane rings.
 */
import { chromium, webkit } from "playwright";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const STAR_CLIP = `polygon(50% 5%, 61% 35%, 93% 35%, 68% 57%, 79% 88%, 50% 71%, 21% 88%, 32% 57%, 7% 35%, 39% 35%)`;
const STAR_POINTS =
  "50,5 61,35 93,35 68,57 79,88 50,71 21,88 32,57 7,35 39,35";
const HEART_PATH_D =
  "M 50 92 C 50 92 8 60 8 34 C 8 14 24 4 50 26 C 76 4 92 14 92 34 C 92 60 50 92 50 92 Z";

const sharedCss = `
  body { margin: 0; background: rgb(20, 10, 40); }
  .row { display: flex; flex-wrap: wrap; }
  .stage { position: relative; width: 200px; height: 200px; margin: 24px; flex: 0 0 auto; }
  .body {
    position: relative; width: 100%; height: 100%;
    overflow: hidden;
    clip-path: ${STAR_CLIP};
  }
  .heart-body { clip-path: url(#heart-clip); }
  .thumb { position: absolute; inset: 0; background: linear-gradient(135deg, #888, #444); }
  .membrane-inset {
    position: absolute; inset: 0; pointer-events: none; background: transparent;
    clip-path: ${STAR_CLIP};
    box-shadow:
      inset 0 0 0 1.5px rgba(255, 255, 255, 0.42),
      inset 0 0 0 2.5px rgba(140, 120, 200, 0.18);
    filter: blur(1.5px);
  }
  .membrane-svg {
    position: absolute; inset: 0; width: 100%; height: 100%;
    pointer-events: none; overflow: visible;
    filter: blur(1.5px);
  }
`;

const html = `<!DOCTYPE html>
<html><head><style>${sharedCss}</style></head><body>
  <svg width="0" height="0" aria-hidden="true">
    <defs>
      <clipPath id="heart-clip" clipPathUnits="objectBoundingBox">
        <path d="M 0.5 0.92 C 0.5 0.92 0.08 0.60 0.08 0.34 C 0.08 0.14 0.24 0.04 0.5 0.26 C 0.76 0.04 0.92 0.14 0.92 0.34 C 0.92 0.60 0.5 0.92 0.5 0.92 Z"/>
      </clipPath>
    </defs>
  </svg>
  <div class="row">
    <div class="stage" id="star-inset">
      <div class="body"><div class="thumb"></div><div class="membrane-inset"></div></div>
    </div>
    <div class="stage" id="star-svg">
      <div class="body">
        <div class="thumb"></div>
        <svg class="membrane-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <polygon points="${STAR_POINTS}" fill="none" stroke="rgba(140, 120, 200, 0.18)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
          <polygon points="${STAR_POINTS}" fill="none" stroke="rgba(255, 255, 255, 0.42)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>
    </div>
    <div class="stage" id="heart-svg">
      <div class="body heart-body">
        <div class="thumb"></div>
        <svg class="membrane-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="${HEART_PATH_D}" fill="none" stroke="rgba(140, 120, 200, 0.18)" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
          <path d="${HEART_PATH_D}" fill="none" stroke="rgba(255, 255, 255, 0.42)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        </svg>
      </div>
    </div>
  </div>
</body></html>`;

const htmlPath = resolve(process.cwd(), "scripts", "membrane-test.html");
writeFileSync(htmlPath, html);

const BG_LUM = 20 + 10 + 40;

function sampleRectBrightness(data, width, height, x0, y0, x1, y1) {
  let bright = 0;
  let total = 0;
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
      const i = (y * width + x) * 4;
      bright += data[i] + data[i + 1] + data[i + 2];
      total++;
    }
  }
  return total ? bright / total : 0;
}

/** Max luminance in a box — catches stroke even if tip coords drift slightly */
function maxRectBrightness(data, width, height, x0, y0, x1, y1) {
  let max = 0;
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
      const i = (y * width + x) * 4;
      const lum = data[i] + data[i + 1] + data[i + 2];
      if (lum > max) max = lum;
    }
  }
  return max;
}

function sampleStarEdgeBand(data, width, height, box) {
  const cx = box.x + box.width / 2;
  const top = box.y + box.height * 0.05;
  return {
    tipAvg: sampleRectBrightness(
      data,
      width,
      height,
      Math.round(cx - 10),
      Math.round(top - 4),
      Math.round(cx + 10),
      Math.round(top + 14),
    ),
    tipMax: maxRectBrightness(
      data,
      width,
      height,
      Math.round(cx - 12),
      Math.round(top - 6),
      Math.round(cx + 12),
      Math.round(top + 20),
    ),
    upperArmAvg: sampleRectBrightness(
      data,
      width,
      height,
      Math.round(box.x + box.width * 0.55),
      Math.round(box.y + box.height * 0.28),
      Math.round(box.x + box.width * 0.72),
      Math.round(box.y + box.height * 0.42),
    ),
  };
}

function sampleHeartBottomTip(data, width, height, box) {
  const cx = box.x + box.width / 2;
  const bottom = box.y + box.height * 0.92;
  return {
    tipAvg: sampleRectBrightness(
      data,
      width,
      height,
      Math.round(cx - 10),
      Math.round(bottom - 12),
      Math.round(cx + 10),
      Math.round(bottom + 2),
    ),
    tipMax: maxRectBrightness(
      data,
      width,
      height,
      Math.round(cx - 12),
      Math.round(bottom - 16),
      Math.round(cx + 12),
      Math.round(bottom + 4),
    ),
  };
}

async function run(browserName) {
  const launcher = browserName === "webkit" ? webkit : chromium;
  const browser = await launcher.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 280 } });
  await page.goto(`file://${htmlPath}`);

  const insetBox = await page.locator("#star-inset .body").boundingBox();
  const starSvgBox = await page.locator("#star-svg .body").boundingBox();
  const heartSvgBox = await page.locator("#heart-svg .body").boundingBox();

  const buf = await page.screenshot({ type: "png" });
  await browser.close();

  const { PNG } = await import("pngjs");
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;

  return {
    browserName,
    backgroundLum: BG_LUM,
    starInset: sampleStarEdgeBand(data, width, height, insetBox),
    starSvg: sampleStarEdgeBand(data, width, height, starSvgBox),
    heartSvg: sampleHeartBottomTip(data, width, height, heartSvgBox),
  };
}

try {
  const results = [];
  for (const b of ["chromium", "webkit"]) {
    try {
      results.push(await run(b));
    } catch (e) {
      results.push({ browserName: b, error: String(e) });
    }
  }
  console.log(JSON.stringify({ phase: "production-equivalent-svg", results }, null, 2));
} catch (e) {
  console.error(e);
  process.exit(1);
}
