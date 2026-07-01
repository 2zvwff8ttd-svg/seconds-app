import { useEffect, useState } from "react";

/** Extra scrim cutout bleed after pinch-zoom (aspect-fit preview fringe at hole edge). */
export const RECORD_HOLE_ZOOM_BLEED_EXTRA_PX = 4;

/**
 * Latch extra mask bleed when the user pinches to zoom. Base bleed (3px circle / 1px
 * others) stays unchanged at 1×; extra applies for the rest of the preview session.
 */
export function usePinchZoomMaskBleedExtra(
  active: boolean,
  resetKey: string | number,
): number {
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    setExtra(0);
  }, [resetKey]);

  useEffect(() => {
    if (!active) {
      setExtra(0);
      return;
    }

    const latch = () => {
      setExtra(RECORD_HOLE_ZOOM_BLEED_EXTRA_PX);
    };

    const onTouch = (e: TouchEvent) => {
      if (e.touches.length >= 2) latch();
    };

    document.addEventListener("touchstart", onTouch, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouch, { passive: true, capture: true });
    return () => {
      document.removeEventListener("touchstart", onTouch, { capture: true });
      document.removeEventListener("touchmove", onTouch, { capture: true });
    };
  }, [active]);

  return extra;
}
