"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  getVideoDisplayMask,
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
 * Fullscreen video viewport with a swappable display mask (circle today; star/heart later).
 */
export function FullscreenVideoMask({
  shape = DEFAULT_VIDEO_DISPLAY_MASK,
  children,
  className,
  style,
}: FullscreenVideoMaskProps) {
  const mask = getVideoDisplayMask(shape);

  return (
    <div
      className={`fullscreen-video-mask fullscreen-video-mask--${mask.modifier}${className ? ` ${className}` : ""}`}
      style={
        {
          ...style,
          "--fs-mask-clip": mask.clipPath,
          "--fs-mask-radius": mask.borderRadius,
          "--fs-mask-visual-scale": String(mask.visualScale),
        } as CSSProperties
      }
    >
      <div className="fullscreen-video-mask__shadow" aria-hidden />
      <div className="fullscreen-video-mask__ground-blend" aria-hidden />
      <div className="fullscreen-video-mask__frame">
        <div className="fullscreen-video-mask__media">
          {children}
          <div className="fullscreen-video-mask__edge" aria-hidden />
          <div className="fullscreen-video-mask__rim" aria-hidden />
          <div className="fullscreen-video-mask__feather" aria-hidden />
        </div>
      </div>
    </div>
  );
}
