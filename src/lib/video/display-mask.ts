export type VideoDisplayMaskShape = "circle";

export const DEFAULT_VIDEO_DISPLAY_MASK: VideoDisplayMaskShape = "circle";

export type VideoDisplayMaskDefinition = {
  /** BEM modifier class suffix, e.g. `circle` → `fullscreen-video-mask--circle` */
  modifier: VideoDisplayMaskShape;
  /** CSS clip-path for the media viewport */
  clipPath: string;
  /** Matches clip-path for overflow clipping fallback */
  borderRadius: string;
};

const MASK_DEFINITIONS: Record<
  VideoDisplayMaskShape,
  VideoDisplayMaskDefinition
> = {
  circle: {
    modifier: "circle",
    clipPath: "circle(50% at 50% 50%)",
    borderRadius: "50%",
  },
};

export function getVideoDisplayMask(
  shape: VideoDisplayMaskShape = DEFAULT_VIDEO_DISPLAY_MASK,
): VideoDisplayMaskDefinition {
  return MASK_DEFINITIONS[shape];
}
