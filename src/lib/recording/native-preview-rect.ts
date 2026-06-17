import type { NativePreviewRect } from "@/lib/recording/native-camera-preview";

const MIN_PREVIEW_DIM = 2;
const DEFAULT_MAX_ATTEMPTS = 48;
const RETRY_INTERVAL_MS = 50;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForLayoutFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function readPreviewRect(el: HTMLElement | null): NativePreviewRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < MIN_PREVIEW_DIM || rect.height < MIN_PREVIEW_DIM) {
    return null;
  }
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
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
  return `プレビュー領域のサイズを取得できません（${w}×${h}px、画面 ${vw}×${vh}px）`;
}

/** レイアウト確定まで待ってから getBoundingClientRect を返す */
export async function resolvePreviewRect(
  getEl: () => HTMLElement | null,
  options?: { maxAttempts?: number },
): Promise<NativePreviewRect | null> {
  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitForLayoutFrame();
    const rect = readPreviewRect(getEl());
    if (rect) return rect;
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
