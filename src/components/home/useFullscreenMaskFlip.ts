"use client";

import type { BubbleOriginRect } from "@/lib/home/bubble-origin-rect";
import { useLayoutEffect, useRef, useState } from "react";

const ENTER_MS = 420;
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useFullscreenMaskFlip(originRect: BubbleOriginRect) {
  const maskRef = useRef<HTMLDivElement>(null);
  const [enterDone, setEnterDone] = useState(false);

  useLayoutEffect(() => {
    const el = maskRef.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      setEnterDone(true);
      return;
    }

    const finalRect = el.getBoundingClientRect();
    if (finalRect.width < 2) return;

    const dx = originRect.centerX - (finalRect.left + finalRect.width / 2);
    const dy = originRect.centerY - (finalRect.top + finalRect.height / 2);
    const scale = originRect.size / finalRect.width;

    el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`;
    el.style.transition = "none";

    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = `transform ${ENTER_MS}ms ${EASE}`;
        el.style.transform = "translate(0, 0) scale(1)";

        const onEnd = (event: TransitionEvent) => {
          if (event.propertyName !== "transform") return;
          el.removeEventListener("transitionend", onEnd);
          el.style.transition = "";
          el.style.transform = "";
          setEnterDone(true);
        };
        el.addEventListener("transitionend", onEnd);

        window.setTimeout(() => {
          el.removeEventListener("transitionend", onEnd);
          el.style.transition = "";
          el.style.transform = "";
          setEnterDone(true);
        }, ENTER_MS + 80);
      });
    });

    return () => cancelAnimationFrame(raf);
  }, [originRect.centerX, originRect.centerY, originRect.size]);

  return { maskRef, enterDone };
}
