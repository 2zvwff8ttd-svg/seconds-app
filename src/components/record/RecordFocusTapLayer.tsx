"use client";

import {
  DEFAULT_VIDEO_DISPLAY_MASK,
  computeRecordHoleRect,
  readRecordViewportMetrics,
} from "@/lib/video/display-mask";
import {
  setNativeFocusPoint,
  viewportClientToPreviewNormalized,
} from "@/lib/recording/native-camera-controls";
import { RecordStagePortal } from "@/components/record/RecordStagePortal";
import { useCallback, useEffect, useRef, useState } from "react";

type HoleRect = { x: number; y: number; width: number; height: number };

type FocusRing = {
  id: number;
  x: number;
  y: number;
};

type RecordFocusTapLayerProps = {
  cameraReady: boolean;
  disabled?: boolean;
};

function pointInHole(clientX: number, clientY: number, hole: HoleRect): boolean {
  return (
    clientX >= hole.x &&
    clientX <= hole.x + hole.width &&
    clientY >= hole.y &&
    clientY <= hole.y + hole.height
  );
}

/**
 * Tap-to-focus via document capture (no overlay — does not block native pinch on WebView).
 */
export function RecordFocusTapLayer({
  cameraReady,
  disabled = false,
}: RecordFocusTapLayerProps) {
  const [hole, setHole] = useState<HoleRect | null>(null);
  const [ring, setRing] = useState<FocusRing | null>(null);
  const holeRef = useRef<HoleRect | null>(null);
  const ringIdRef = useRef(0);
  const hideRingTimerRef = useRef<number | null>(null);
  const activeTouchPointersRef = useRef(0);
  const tapCandidateRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    holeRef.current = hole;
  }, [hole]);

  useEffect(() => {
    const measure = () => {
      const viewport = readRecordViewportMetrics();
      if (viewport.width <= 0 || viewport.height <= 0) {
        setHole(null);
        return;
      }
      const rect = computeRecordHoleRect(DEFAULT_VIDEO_DISPLAY_MASK, viewport);
      setHole({
        x: rect.x + viewport.offsetX,
        y: rect.y + viewport.offsetY,
        width: rect.width,
        height: rect.height,
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    window.addEventListener("orientationchange", measure);

    return () => {
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, []);

  const clearRingTimer = useCallback(() => {
    if (hideRingTimerRef.current !== null) {
      window.clearTimeout(hideRingTimerRef.current);
      hideRingTimerRef.current = null;
    }
  }, []);

  const showRing = useCallback(
    (clientX: number, clientY: number) => {
      clearRingTimer();
      ringIdRef.current += 1;
      setRing({ id: ringIdRef.current, x: clientX, y: clientY });
      hideRingTimerRef.current = window.setTimeout(() => {
        setRing(null);
        hideRingTimerRef.current = null;
      }, 1400);
    },
    [clearRingTimer],
  );

  useEffect(() => () => clearRingTimer(), [clearRingTimer]);

  useEffect(() => {
    if (!cameraReady || disabled) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const currentHole = holeRef.current;
      if (!currentHole) return;

      activeTouchPointersRef.current += 1;
      if (activeTouchPointersRef.current > 1) {
        tapCandidateRef.current = null;
        return;
      }

      if (!pointInHole(e.clientX, e.clientY, currentHole)) return;

      tapCandidateRef.current = {
        pointerId: e.pointerId,
        x: e.clientX,
        y: e.clientY,
      };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;

      const candidate = tapCandidateRef.current;
      if (
        candidate &&
        candidate.pointerId === e.pointerId &&
        activeTouchPointersRef.current === 1
      ) {
        const { x, y } = viewportClientToPreviewNormalized(
          candidate.x,
          candidate.y,
        );
        void setNativeFocusPoint(x, y).catch(() => {
          /* older native builds without setFocusPoint */
        });
        showRing(candidate.x, candidate.y);
      }

      activeTouchPointersRef.current = Math.max(
        0,
        activeTouchPointersRef.current - 1,
      );
      if (activeTouchPointersRef.current === 0) {
        tapCandidateRef.current = null;
      }
    };

    const onPointerCancel = () => {
      activeTouchPointersRef.current = 0;
      tapCandidateRef.current = null;
    };

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("pointerup", onPointerUp, { capture: true });
    document.addEventListener("pointercancel", onPointerCancel, {
      capture: true,
    });

    return () => {
      document.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
      document.removeEventListener("pointerup", onPointerUp, { capture: true });
      document.removeEventListener("pointercancel", onPointerCancel, {
        capture: true,
      });
    };
  }, [cameraReady, disabled, showRing]);

  if (!cameraReady || !ring) return null;

  return (
    <RecordStagePortal>
      <span
        key={ring.id}
        className="record-focus-ring"
        style={{ left: ring.x, top: ring.y }}
        aria-hidden
      />
    </RecordStagePortal>
  );
}
