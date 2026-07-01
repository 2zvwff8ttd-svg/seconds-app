"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  getVideoDisplayMask,
  getVideoDisplayMaskCssVars,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";
import { BubbleDisplayMembraneRing } from "@/components/video/BubbleDisplayMembraneRing";
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
  const maskStyle = getVideoDisplayMaskCssVars(shape);
  const isCircle = shape === "circle";

  return (
    <div
      className={`fullscreen-video-mask${className ? ` ${className}` : ""}`}
      style={
        {
          ...maskStyle,
          ...style,
          "--fs-mask-visual-scale": String(mask.visualScale),
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
          {isCircle ? (
            <div
              className="display-mask-membrane fullscreen-video-mask__membrane"
              aria-hidden
            />
          ) : (
            <BubbleDisplayMembraneRing
              shape={shape}
              className="display-mask-membrane-ring fullscreen-video-mask__membrane-ring"
            />
          )}
        </div>
      </div>
    </div>
  );
}
