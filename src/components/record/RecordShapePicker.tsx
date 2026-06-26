"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  getVideoDisplayMask,
  MASK_SHAPE_ORDER,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import { useCallback, useLayoutEffect, useRef } from "react";

type RecordShapePickerProps = {
  value: VideoDisplayMaskShape;
  onChange: (shape: VideoDisplayMaskShape) => void;
  disabled?: boolean;
};

function ShapeIcon({ shape }: { shape: VideoDisplayMaskShape }) {
  if (shape === "circle") {
    return (
      <circle cx="50" cy="50" r="38" fill="none" stroke="currentColor" strokeWidth="5" />
    );
  }
  if (shape === "star") {
    return (
      <path
        d="M 50 10 L 59 38 L 88 38 L 65 56 L 74 84 L 50 68 L 26 84 L 35 56 L 12 38 L 41 38 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  if (shape === "heart") {
    return (
      <path
        d="M 50 92 C 50 92 8 60 8 34 C 8 14 24 4 50 22 C 76 4 92 14 92 34 C 92 60 50 92 50 92 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  if (shape === "diamond") {
    return (
      <path
        d="M 50 12 L 84 50 L 50 88 L 16 50 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinejoin="round"
      />
    );
  }
  return (
    <rect
      x="16"
      y="16"
      width="68"
      height="68"
      rx="14"
      ry="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="5"
    />
  );
}

function scrollItemIntoViewport(
  viewport: HTMLDivElement,
  item: HTMLButtonElement,
  behavior: ScrollBehavior,
): void {
  const targetLeft = item.offsetLeft - (viewport.clientWidth - item.offsetWidth) / 2;
  const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
  viewport.scrollTo({
    left: Math.min(maxScroll, Math.max(0, targetLeft)),
    behavior,
  });
}

export function RecordShapePicker({
  value,
  onChange,
  disabled = false,
}: RecordShapePickerProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<VideoDisplayMaskShape, HTMLButtonElement>());

  const scrollShapeIntoView = useCallback(
    (shape: VideoDisplayMaskShape, behavior: ScrollBehavior) => {
      const viewport = viewportRef.current;
      const item = itemRefs.current.get(shape);
      if (!viewport || !item) return;

      if (shape === DEFAULT_VIDEO_DISPLAY_MASK) {
        viewport.scrollTo({ left: 0, behavior });
        return;
      }

      scrollItemIntoViewport(viewport, item, behavior);
    },
    [],
  );

  useLayoutEffect(() => {
    scrollShapeIntoView(value, "instant");
  }, [value, scrollShapeIntoView]);

  const setItemRef = useCallback(
    (shape: VideoDisplayMaskShape, node: HTMLButtonElement | null) => {
      if (node) {
        itemRefs.current.set(shape, node);
      } else {
        itemRefs.current.delete(shape);
      }
    },
    [],
  );

  const handleSelect = useCallback(
    (shape: VideoDisplayMaskShape) => {
      onChange(shape);
      requestAnimationFrame(() => {
        scrollShapeIntoView(shape, "smooth");
      });
    },
    [onChange, scrollShapeIntoView],
  );

  return (
    <div className="record-shape-picker" role="radiogroup" aria-label="撮影する形">
      <div className="record-shape-picker__edge record-shape-picker__edge--start" aria-hidden />
      <div className="record-shape-picker__edge record-shape-picker__edge--end" aria-hidden />
      <div
        ref={viewportRef}
        className="record-shape-picker__viewport"
        aria-orientation="horizontal"
      >
        <div className="record-shape-picker__track">
          {MASK_SHAPE_ORDER.map((shape) => {
            const def = getVideoDisplayMask(shape);
            const selected = value === shape;
            return (
              <button
                key={shape}
                ref={(node) => setItemRef(shape, node)}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={def.label}
                disabled={disabled}
                onClick={() => handleSelect(shape)}
                className={`record-shape-picker__item${selected ? " record-shape-picker__item--selected" : ""}`}
              >
                <span className="record-shape-picker__icon-wrap" aria-hidden>
                  <svg viewBox="0 0 100 100" className="record-shape-picker__icon">
                    <ShapeIcon shape={shape} />
                  </svg>
                </span>
                <span className="record-shape-picker__label">{def.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
