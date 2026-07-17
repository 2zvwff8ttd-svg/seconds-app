"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  getVideoDisplayMaskCssVars,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import type { CSSProperties, ReactNode } from "react";

type FullscreenVideoMaskProps = {
  shape?: VideoDisplayMaskShape;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Fullscreen video viewport with a circle display mask.
 */
export function FullscreenVideoMask({
  shape: _shape = DEFAULT_VIDEO_DISPLAY_MASK,
  children,
  className,
  style,
}: FullscreenVideoMaskProps) {
  const maskStyle = getVideoDisplayMaskCssVars();

  return (
    <div
      className={`fullscreen-video-mask${className ? ` ${className}` : ""}`}
      style={
        {
          ...maskStyle,
          ...style,
          "--fs-mask-visual-scale": "1",
        } as CSSProperties
      }
    >
      <div className="fullscreen-video-mask__shadow" aria-hidden />
      <div className="fullscreen-video-mask__ground-blend" aria-hidden />
      <div className="fullscreen-video-mask__frame">
        <div className="fullscreen-video-mask__media">
          {children}
          <div
            className="display-mask-feather fullscreen-video-mask__feather"
            aria-hidden
          />
          <div
            className="display-mask-membrane fullscreen-video-mask__membrane"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}
