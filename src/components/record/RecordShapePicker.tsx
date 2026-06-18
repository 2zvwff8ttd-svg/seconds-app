"use client";

import {
  getVideoDisplayMask,
  MASK_SHAPE_ORDER,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";

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

export function RecordShapePicker({
  value,
  onChange,
  disabled = false,
}: RecordShapePickerProps) {
  return (
    <div className="record-shape-picker" role="radiogroup" aria-label="撮影する形">
      <div className="record-shape-picker__track">
        {MASK_SHAPE_ORDER.map((shape) => {
          const def = getVideoDisplayMask(shape);
          const selected = value === shape;
          return (
            <button
              key={shape}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={def.label}
              disabled={disabled}
              onClick={() => onChange(shape)}
              className={`record-shape-picker__item${selected ? " record-shape-picker__item--selected" : ""}`}
            >
              <svg viewBox="0 0 100 100" className="record-shape-picker__icon" aria-hidden>
                <ShapeIcon shape={shape} />
              </svg>
              <span className="record-shape-picker__label">{def.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
