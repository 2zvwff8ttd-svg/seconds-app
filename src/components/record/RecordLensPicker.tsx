"use client";

import {
  getNativeAvailableLenses,
  getNativeZoomFactor,
  setNativeZoomFactor,
  type NativeCameraLens,
} from "@/lib/recording/native-camera-controls";
import { RecordStagePortal } from "@/components/record/RecordStagePortal";
import { useCallback, useEffect, useState } from "react";

type RecordLensPickerProps = {
  cameraReady: boolean;
  facingMode: "user" | "environment";
  disabled?: boolean;
  isRecording?: boolean;
};

function lensMatchesZoom(lens: NativeCameraLens, zoom: number): boolean {
  return Math.abs(lens.factor - zoom) < 0.12;
}

export function RecordLensPicker({
  cameraReady,
  facingMode,
  disabled = false,
  isRecording = false,
}: RecordLensPickerProps) {
  const [lenses, setLenses] = useState<NativeCameraLens[]>([]);
  const [activeZoom, setActiveZoom] = useState(1);
  const [loading, setLoading] = useState(false);

  const refreshLenses = useCallback(async () => {
    if (!cameraReady || facingMode !== "environment") {
      setLenses([]);
      return;
    }
    setLoading(true);
    try {
      const [available, zoom] = await Promise.all([
        getNativeAvailableLenses(),
        getNativeZoomFactor(),
      ]);
      setLenses(available);
      setActiveZoom(zoom);
    } catch {
      setLenses([]);
    } finally {
      setLoading(false);
    }
  }, [cameraReady, facingMode]);

  useEffect(() => {
    void refreshLenses();
  }, [refreshLenses]);

  const handleSelect = useCallback(
    async (lens: NativeCameraLens) => {
      if (disabled || isRecording || loading) return;
      try {
        const factor = await setNativeZoomFactor(lens.factor);
        setActiveZoom(factor);
      } catch {
        /* ignore unsupported lens on this build */
      }
    },
    [disabled, isRecording, loading],
  );

  if (!cameraReady || facingMode !== "environment" || lenses.length <= 1) {
    return null;
  }

  return (
    <RecordStagePortal>
      <div
        className="record-lens-picker"
        role="group"
        aria-label="レンズ倍率"
      >
        {lenses.map((lens) => {
          const selected = lensMatchesZoom(lens, activeZoom);
          return (
            <button
              key={lens.id}
              type="button"
              className={`record-lens-picker__btn${selected ? " record-lens-picker__btn--active" : ""}`}
              disabled={disabled || isRecording || loading}
              onClick={() => void handleSelect(lens)}
              aria-pressed={selected}
            >
              {lens.label}
            </button>
          );
        })}
      </div>
    </RecordStagePortal>
  );
}
