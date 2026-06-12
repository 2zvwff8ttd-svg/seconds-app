export type BubbleOriginRect = {
  centerX: number;
  centerY: number;
  size: number;
};

export function getBubbleOriginRect(el: HTMLElement): BubbleOriginRect {
  const rect = el.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  return {
    centerX: rect.left + rect.width / 2,
    centerY: rect.top + rect.height / 2,
    size,
  };
}

/** バブル起点がない画面（プロフィール等）向けのフォールバック */
export function getDefaultFullscreenOrigin(): BubbleOriginRect {
  if (typeof window === "undefined") {
    return { centerX: 0, centerY: 0, size: 120 };
  }
  return {
    centerX: window.innerWidth / 2,
    centerY: window.innerHeight * 0.38,
    size: Math.min(window.innerWidth, window.innerHeight) * 0.22,
  };
}
