import {
  getDisplayMaskMembraneSvgOutline,
  type VideoDisplayMaskShape,
} from "@/lib/video/display-mask";

type BubbleDisplayMembraneRingProps = {
  shape: VideoDisplayMaskShape;
  className?: string;
};

const strokeProps = {
  fill: "none" as const,
  vectorEffect: "nonScalingStroke" as const,
};

function MembraneStrokeOutline({
  outline,
}: {
  outline: NonNullable<ReturnType<typeof getDisplayMaskMembraneSvgOutline>>;
}) {
  const line2 = (
    <MembraneStrokeShape
      outline={outline}
      className="display-mask-membrane-ring__line display-mask-membrane-ring__line--2"
    />
  );
  const line1 = (
    <MembraneStrokeShape
      outline={outline}
      className="display-mask-membrane-ring__line display-mask-membrane-ring__line--1"
    />
  );

  return (
    <>
      {line2}
      {line1}
    </>
  );
}

function MembraneStrokeShape({
  outline,
  className,
}: {
  outline: NonNullable<ReturnType<typeof getDisplayMaskMembraneSvgOutline>>;
  className: string;
}) {
  if (outline.type === "polygon") {
    return (
      <polygon points={outline.points} className={className} {...strokeProps} />
    );
  }
  if (outline.type === "path") {
    return <path d={outline.d} className={className} {...strokeProps} />;
  }
  return (
    <rect
      x={outline.x}
      y={outline.y}
      width={outline.width}
      height={outline.height}
      rx={outline.rx}
      ry={outline.ry}
      className={className}
      {...strokeProps}
    />
  );
}

/**
 * Contour-following soap-film ring for non-circle display masks.
 * Circle bubbles keep the CSS inset `.display-mask-membrane` layer.
 */
export function BubbleDisplayMembraneRing({
  shape,
  className,
}: BubbleDisplayMembraneRingProps) {
  const outline = getDisplayMaskMembraneSvgOutline(shape);
  if (!outline) return null;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      <MembraneStrokeOutline outline={outline} />
    </svg>
  );
}
