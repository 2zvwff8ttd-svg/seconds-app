import type { CSSProperties } from "react";

/** 環境光（中央上部の紫グラデ）に合わせたガラス用 CSS 変数 */
export type BubbleGlassStyle = CSSProperties & {
  "--bubble-hl-top": string;
  "--bubble-hl-left": string;
  "--bubble-hl-width": string;
  "--bubble-hl-height": string;
  "--bubble-hl-rotate": string;
  "--bubble-hl-opacity": string;
  "--bubble-spec-top": string;
  "--bubble-spec-left": string;
  "--bubble-spec-opacity": string;
  "--bubble-refraction-opacity": string;
  "--bubble-atmo-opacity": string;
  "--bubble-edge-glow": string;
};

const HIGHLIGHT_VARIANTS = [
  { top: 0, left: 2, width: 50, height: 36, rotate: -36, specTop: 18, specLeft: 12 },
  { top: 1, left: 5, width: 48, height: 34, rotate: -30, specTop: 16, specLeft: 15 },
  { top: -1, left: 3, width: 54, height: 38, rotate: -26, specTop: 20, specLeft: 10 },
  { top: 2, left: 7, width: 46, height: 32, rotate: -33, specTop: 14, specLeft: 18 },
  { top: 0, left: 4, width: 52, height: 37, rotate: -28, specTop: 19, specLeft: 13 },
  { top: 1, left: 6, width: 49, height: 35, rotate: -31, specTop: 17, specLeft: 11 },
] as const;

/**
 * 画面上の位置（上ほど明るい）とバブルごとのバリエーションで
 * ハイライト・屈折・大気感の強度を決める。
 */
export function getBubbleGlassStyle(
  variantIndex: number,
  normalizedY: number,
  isViral: boolean,
): BubbleGlassStyle {
  const variant = HIGHLIGHT_VARIANTS[variantIndex % HIGHLIGHT_VARIANTS.length];
  const y = Math.min(1, Math.max(0, normalizedY));
  const topLight = 1 - y * 0.72;
  const baseHlOpacity = 0.28 + topLight * 0.32;
  const hlOpacity = isViral
    ? Math.min(0.72, baseHlOpacity + 0.12)
    : baseHlOpacity;
  const refraction = 0.42 + y * 0.38;
  const atmo = 0.22 + topLight * 0.18;
  const edgeGlow = 0.18 + topLight * 0.14;

  return {
    "--bubble-hl-top": `${variant.top}%`,
    "--bubble-hl-left": `${variant.left}%`,
    "--bubble-hl-width": `${variant.width}%`,
    "--bubble-hl-height": `${variant.height}%`,
    "--bubble-hl-rotate": `${variant.rotate}deg`,
    "--bubble-hl-opacity": String(hlOpacity),
    "--bubble-spec-top": `${variant.specTop}%`,
    "--bubble-spec-left": `${variant.specLeft}%`,
    "--bubble-spec-opacity": String(Math.min(0.55, hlOpacity * 0.75)),
    "--bubble-refraction-opacity": String(refraction),
    "--bubble-atmo-opacity": String(atmo),
    "--bubble-edge-glow": String(edgeGlow),
  };
}
