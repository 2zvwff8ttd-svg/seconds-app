"use client";

import {
  DISPLAY_MASK_HEART_CLIP_ID,
  HEART_MASK_PATH_OBJECT_BOUNDING_BOX_D,
} from "@/lib/video/display-mask";

/** Global SVG clip paths for responsive display masks (heart uses objectBoundingBox 0–1). */
export function DisplayMaskClipDefs() {
  return (
    <svg
      aria-hidden
      width={0}
      height={0}
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        overflow: "hidden",
      }}
    >
      <defs>
        <clipPath
          id={DISPLAY_MASK_HEART_CLIP_ID}
          clipPathUnits="objectBoundingBox"
        >
          <path d={HEART_MASK_PATH_OBJECT_BOUNDING_BOX_D} />
        </clipPath>
      </defs>
    </svg>
  );
}
