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
 * iOS も含め x/y/width/height は DOM のポイント値（CSS px）をそのまま渡す。
 */
export function toPluginPreviewRect(rect: NativePreviewRect): NativePreviewRect {
  return rect;
}

export type PreviewRectDebugInfo = {
  dom: NativePreviewRect;
  plugin: NativePreviewRect;
  boundingClient: {
    left: number;
    top: number;
    width: number;
    height: number;
    right: number;
    bottom: number;
  };
  dpr: number;
  viewport: {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
  };
  scrollY: number;
};

/** 実機デバッグ用: DOM / plugin 座標の実数を返す */
export function getPreviewRectDebugInfo(
  el: HTMLElement | null,
): PreviewRectDebugInfo | null {
  if (!el) return null;
  const domRect = readPreviewRect(el);
  if (!domRect) return null;

  const bounds = el.getBoundingClientRect();
  const { offsetX, offsetY } = getViewportOffsets();

  return {
    dom: domRect,
    plugin: toPluginPreviewRect(domRect),
    boundingClient: {
      left: Math.round(bounds.left),
      top: Math.round(bounds.top),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      right: Math.round(bounds.right),
      bottom: Math.round(bounds.bottom),
    },
    dpr: window.devicePixelRatio || 1,
    viewport: {
      width: Math.round(window.visualViewport?.width ?? window.innerWidth),
      height: Math.round(window.visualViewport?.height ?? window.innerHeight),
      offsetX: Math.round(offsetX),
      offsetY: Math.round(offsetY),
    },
    scrollY: Math.round(window.scrollY),
  };
}

export function logPreviewRectDebug(
  context: string,
  el: HTMLElement | null,
): PreviewRectDebugInfo | null {
  const info = getPreviewRectDebugInfo(el);
  if (!info) {
    console.warn(`[preview-rect] ${context}: element missing or zero-size`);
    return null;
  }

  console.info(`[preview-rect] ${context}`, {
    dom: `${info.dom.x},${info.dom.y} ${info.dom.width}×${info.dom.height}`,
    plugin: `${info.plugin.x},${info.plugin.y} ${info.plugin.width}×${info.plugin.height}`,
    boundingClient: info.boundingClient,
    dpr: info.dpr,
    viewport: info.viewport,
    scrollY: info.scrollY,
  });
  return info;
}

export function formatPreviewRectDebug(rect: NativePreviewRect): string {
  return `dom=${rect.x},${rect.y} ${rect.width}×${rect.height} → plugin=${rect.x},${rect.y} ${rect.width}×${rect.height}`;
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
      logPreviewRectDebug("resolvePreviewRect", getEl());
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
