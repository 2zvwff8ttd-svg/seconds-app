"use client";

import type { CSSProperties } from "react";
import {
  FOG_QUESTION_BLOBS,
  FOG_QUESTION_HEIGHT,
  FOG_QUESTION_WIDTH,
} from "@/lib/opening/fog-question-blobs";

type FogQuestionMarkProps = {
  mode: "intro" | "pass";
};

/** Mist “?” built from blurred blobs — no sharp glyph. */
export function FogQuestionMark({ mode }: FogQuestionMarkProps) {
  return (
    <div
      className={`opening-fog-question opening-fog-question--${mode}`}
      style={
        {
          "--fq-width": `${FOG_QUESTION_WIDTH}px`,
          "--fq-height": `${FOG_QUESTION_HEIGHT}px`,
        } as CSSProperties
      }
      aria-hidden
    >
      <div className="opening-fog-question__core">
        {FOG_QUESTION_BLOBS.map((blob, index) => (
          <span
            key={index}
            className="opening-fog-blob"
            style={{
              left: `calc(50% + ${blob.x}px)`,
              top: `calc(50% + ${blob.y}px)`,
              width: blob.w,
              height: blob.h,
              opacity: blob.o,
            }}
          />
        ))}
      </div>
    </div>
  );
}
