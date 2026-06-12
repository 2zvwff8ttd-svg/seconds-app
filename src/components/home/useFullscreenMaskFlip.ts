"use client";

import type { BubbleOriginRect } from "@/lib/home/bubble-origin-rect";
import {
  FULLSCREEN_ENTER_EASE,
  FULLSCREEN_ENTER_MS,
} from "@/lib/home/fullscreen-transition";
import { useLayoutEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function logFlipDebug(label: string, data: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.debug(`[fullscreen-flip] ${label}`, data);
}

type UseFullscreenMaskFlipOptions = {
  originRect: BubbleOriginRect;
  onFlipStart?: () => void;
  onFlipComplete?: () => void;
};

export function useFullscreenMaskFlip({
  originRect,
  onFlipStart,
  onFlipComplete,
}: UseFullscreenMaskFlipOptions) {
  const maskRef = useRef<HTMLDivElement>(null);
  const [enterDone, setEnterDone] = useState(false);
  const [flipVisible, setFlipVisible] = useState(false);
  const callbacksRef = useRef({ onFlipStart, onFlipComplete });
  callbacksRef.current = { onFlipStart, onFlipComplete };

  useLayoutEffect(() => {
    const el = maskRef.current;
    if (!el) return;

    let cancelled = false;
    let finishTimer: number | undefined;
    let retryTimer: number | undefined;

    const finish = () => {
      if (cancelled) return;
      el.style.transition = "";
      el.style.transform = "";
      setEnterDone(true);
      callbacksRef.current.onFlipComplete?.();
    };

    if (prefersReducedMotion()) {
      setFlipVisible(true);
      setEnterDone(true);
      callbacksRef.current.onFlipStart?.();
      callbacksRef.current.onFlipComplete?.();
      return;
    }

    setEnterDone(false);
    setFlipVisible(false);

    const startTransition = (finalRect: DOMRect) => {
      const finalCx = finalRect.left + finalRect.width / 2;
      const finalCy = finalRect.top + finalRect.height / 2;
      const dx = originRect.centerX - finalCx;
      const dy = originRect.centerY - finalCy;
      const scale =
        finalRect.width > 0 ? originRect.size / finalRect.width : 1;

      logFlipDebug("measure", {
        originRect,
        finalRect: {
          left: finalRect.left,
          top: finalRect.top,
          width: finalRect.width,
          height: finalRect.height,
          centerX: finalCx,
          centerY: finalCy,
        },
        dx,
        dy,
        scale,
      });

      el.style.transformOrigin = "center center";
      el.style.transition = "none";
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;

      // Force the browser to commit the inverted transform before animating.
      void el.getBoundingClientRect();

      setFlipVisible(true);
      callbacksRef.current.onFlipStart?.();

      requestAnimationFrame(() => {
        if (cancelled) return;
        el.style.transition = `transform ${FULLSCREEN_ENTER_MS}ms ${FULLSCREEN_ENTER_EASE}`;
        el.style.transform = "translate3d(0, 0, 0) scale(1)";

        const onEnd = (event: TransitionEvent) => {
          if (event.propertyName !== "transform") return;
          el.removeEventListener("transitionend", onEnd);
          window.clearTimeout(finishTimer);
          finish();
        };

        el.addEventListener("transitionend", onEnd);
        finishTimer = window.setTimeout(() => {
          el.removeEventListener("transitionend", onEnd);
          finish();
        }, FULLSCREEN_ENTER_MS + 120);
      });
    };

    const measureAndFlip = (attempt = 0) => {
      if (cancelled) return;

      const finalRect = el.getBoundingClientRect();
      if (finalRect.width < 2 && attempt < 8) {
        retryTimer = window.setTimeout(
          () => measureAndFlip(attempt + 1),
          16,
        );
        return;
      }

      if (finalRect.width < 2) {
        logFlipDebug("skip", { reason: "mask not laid out", attempt });
        setFlipVisible(true);
        setEnterDone(true);
        callbacksRef.current.onFlipStart?.();
        callbacksRef.current.onFlipComplete?.();
        return;
      }

      startTransition(finalRect);
    };

    measureAndFlip();

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (finishTimer !== undefined) window.clearTimeout(finishTimer);
    };
  }, [originRect.centerX, originRect.centerY, originRect.size]);

  return { maskRef, enterDone, flipVisible };
}
