"use client";

import {
  getVideoDisplayMaskCssVars,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { CSSProperties, ReactNode } from "react";

type DisplayMaskMediaProps = {
  shape: VideoDisplayMaskShape;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/** Square viewport with clip-path from display-mask.ts (clips, thumbnails, preview). */
export function DisplayMaskMedia({
  shape,
  children,
  className = "",
  style,
}: DisplayMaskMediaProps) {
  const maskVars = getVideoDisplayMaskCssVars(shape);

  return (
    <div
      className={`display-mask-media${className ? ` ${className}` : ""}`}
      style={{ ...maskVars, ...style } as CSSProperties}
    >
      {children}
    </div>
  );
}
