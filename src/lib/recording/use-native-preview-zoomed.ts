"use client";

import { getNativeZoomFactor } from "@/lib/recording/native-camera-controls";
import { useEffect, useState } from "react";

const ZOOMED_THRESHOLD = 1.02;
/** Poll often enough that hole inset tracks pinch without a visible lag. */
const NATIVE_ZOOM_POLL_MS = 100;

async function readNativeZoomed(): Promise<boolean | null> {
  try {
    const factor = await getNativeZoomFactor();
    return factor > ZOOMED_THRESHOLD;
  } catch {
    return null;
  }
}

/**
 * True while native preview zoom is above 1×.
 * Uses getZoom when the plugin exposes it; falls back to a two-finger pinch latch.
 */
export function useNativePreviewZoomed(active: boolean): boolean {
  const [pinchLatched, setPinchLatched] = useState(false);
  const [nativeZoomed, setNativeZoomed] = useState(false);
  const [nativeZoomReadable, setNativeZoomReadable] = useState(false);

  useEffect(() => {
    if (!active) {
      setPinchLatched(false);
      setNativeZoomed(false);
      setNativeZoomReadable(false);
      return;
    }

    let cancelled = false;

    const syncNativeZoom = async () => {
      const zoomed = await readNativeZoomed();
      if (cancelled || zoomed === null) return;
      setNativeZoomReadable(true);
      setNativeZoomed(zoomed);
      if (!zoomed) setPinchLatched(false);
    };

    void syncNativeZoom();
    const pollId = window.setInterval(() => void syncNativeZoom(), NATIVE_ZOOM_POLL_MS);

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        setPinchLatched(true);
        void syncNativeZoom();
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        void syncNativeZoom();
      }
    };

    const onTouchEnd = () => {
      void syncNativeZoom();
    };

    document.addEventListener("touchstart", onTouchStart, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchmove", onTouchMove, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchend", onTouchEnd, {
      capture: true,
      passive: true,
    });
    document.addEventListener("touchcancel", onTouchEnd, {
      capture: true,
      passive: true,
    });

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
      document.removeEventListener("touchend", onTouchEnd, true);
      document.removeEventListener("touchcancel", onTouchEnd, true);
    };
  }, [active]);

  if (!active) return false;

  if (nativeZoomReadable) {
    return nativeZoomed;
  }

  return pinchLatched;
}

export { ZOOMED_THRESHOLD };
