import { Capacitor } from "@capacitor/core";
import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";

const MIN_PREVIEW_DIM = 2;
const DEFAULT_MAX_ATTEMPTS = 16;
export const PREVIEW_RECT_BOOT_MAX_ATTEMPTS = 12;
const RETRY_INTERVAL_MS = 50;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function getViewportOffsets(): { offsetX: number; offsetY: number } {
  // Capacitor iOS: getBoundingClientRect is already in WebView coordinates.
  if (Capacitor.getPlatform() === "ios") {
    return { offsetX: 0, offsetY: 0 };
  }

  const vv = window.visualViewport;
  return {
    offsetX: vv?.offsetLeft ?? 0,
    offsetY: vv?.offsetTop ?? 0,
  };
}

/** DOM 上のプレビュー枠（CSS px） */
export function readPreviewRect(el: HTMLElement | null): NativePreviewRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < MIN_PREVIEW_DIM || rect.height < MIN_PREVIEW_DIM) {
    return null;
  }
  const { offsetX, offsetY } = getViewportOffsets();
  return {
    x: Math.round(rect.left - offsetX),
    y: Math.round(rect.top - offsetY),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/**
 * camera-preview プラグインへ渡す座標。
 * iOS ネイティブ側は x/y を UIScreen.main.scale で割るが width/height は割らない。
 */
export function toPluginPreviewRect(rect: NativePreviewRect): NativePreviewRect {
  if (Capacitor.getPlatform() !== "ios") {
    return rect;
  }
  const scale = window.devicePixelRatio || 1;
  return {
    x: Math.round(rect.x * scale),
    y: Math.round(rect.y * scale),
    width: rect.width,
    height: rect.height,
  };
}

export function formatPreviewRectDebug(rect: NativePreviewRect): string {
  const plugin = toPluginPreviewRect(rect);
  const scale = window.devicePixelRatio || 1;
  return `dom=${rect.x},${rect.y} ${rect.width}×${rect.height} → plugin=${plugin.x},${plugin.y} ${plugin.width}×${plugin.height} (dpr=${scale})`;
}

export function describePreviewRectFailure(el: HTMLElement | null): string {
  if (!el) {
    return "プレビュー領域の要素が見つかりません";
  }
  const rect = el.getBoundingClientRect();
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const vw = Math.round(window.visualViewport?.width ?? window.innerWidth);
  const vh = Math.round(window.visualViewport?.height ?? window.innerHeight);
  const { offsetX, offsetY } = getViewportOffsets();
  return `プレビュー領域のサイズを取得できません（${w}×${h}px、画面 ${vw}×${vh}px、viewport offset ${Math.round(offsetX)},${Math.round(offsetY)}）`;
}

/** レイアウト確定まで待ってから rect を返す（プラグイン座標系） */
export async function resolvePreviewRect(
  getEl: () => HTMLElement | null,
  options?: { maxAttempts?: number },
): Promise<NativePreviewRect | null> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitForLayoutFrame();
    const domRect = readPreviewRect(getEl());
    if (domRect) {
      const pluginRect = toPluginPreviewRect(domRect);
      console.info(
        `[NativeCameraRecorder] resolvePreviewRect: ${formatPreviewRectDebug(domRect)}`,
      );
      return pluginRect;
    }
    if (attempt < maxAttempts - 1) {
      await waitMs(RETRY_INTERVAL_MS);
    }
  }

  return null;
}

export function logPreviewRectFailure(
  context: string,
  el: HTMLElement | null,
): void {
  const message = describePreviewRectFailure(el);
  console.warn(`[NativeCameraRecorder] ${context}: ${message}`);
}
