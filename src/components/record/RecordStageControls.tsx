"use client";

import { RecordClipStrip } from "@/components/record/RecordClipStrip";
import { RecordStagePortal } from "@/components/record/RecordStagePortal";
import { TimeBudgetGauge } from "@/components/record/TimeBudgetGauge";
import type { RecordedClip } from "@/types/recording";

type RecordStageControlsProps = {
  assignedSeconds: number | null;
  usedClipSeconds: number;
  gaugeRecordingElapsed: number;
  cameraReady: boolean;
  cameraStarting: boolean;
  recordingStarting: boolean;
  isRecording: boolean;
  canRecord: boolean;
  disabled: boolean;
  error: string | null;
  clips: RecordedClip[];
  onClipRemove: (id: string) => void;
  onSwitchCamera: () => void;
  onRecordPress: () => void;
  showLimitMessage: boolean;
};

/**
 * Fixed record UI on document.body (z-record-dock).
 * Dock hosts clip strip (replacing shape picker) above the record button.
 */
export function RecordStageControls({
  assignedSeconds,
  usedClipSeconds,
  gaugeRecordingElapsed,
  cameraReady,
  cameraStarting,
  recordingStarting,
  isRecording,
  canRecord,
  disabled,
  error,
  clips,
  onClipRemove,
  onSwitchCamera,
  onRecordPress,
  showLimitMessage,
}: RecordStageControlsProps) {
  return (
    <RecordStagePortal>
      <div className="record-stage-ui">
        <div className="record-stage-ui__gauge">
          <TimeBudgetGauge
            assignedSeconds={assignedSeconds}
            usedSeconds={usedClipSeconds}
            recordingElapsed={gaugeRecordingElapsed}
          />
        </div>

        {!cameraReady && !isRecording && !error && (
          <div className="record-stage-ui__loading">
            <p className="text-sm font-medium text-foreground">カメラを準備中…</p>
            <p className="mt-1 text-xs text-muted">アプリ内プレビューで録画します</p>
          </div>
        )}

        {cameraStarting && (
          <div className="record-stage-ui__loading record-stage-ui__loading--dim">
            カメラを起動中…
          </div>
        )}

        {recordingStarting && (
          <div className="record-stage-ui__loading record-stage-ui__loading--dim">
            録画を開始しています…
          </div>
        )}

        <button
          type="button"
          onClick={onSwitchCamera}
          disabled={isRecording || cameraStarting || disabled || !cameraReady}
          className="record-stage-ui__flip"
          aria-label="カメラ切り替え"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 7h4l2-3h8l2 3h4v12H4V7z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
        </button>

        {cameraReady && !isRecording && !cameraStarting && (
          <p className="record-stage-ui__zoom-hint" aria-hidden>
            ピンチでズーム
          </p>
        )}

        <div className="record-stage-ui__dock">
          <RecordClipStrip
            clips={clips}
            onRemove={onClipRemove}
            disabled={
              disabled || cameraStarting || recordingStarting || isRecording
            }
          />

          <div className="record-stage-ui__dock-status" aria-live="polite">
            <span
              className={`record-stage-ui__recording-badge${isRecording ? "" : " record-stage-ui__dock-status-item--hidden"}`}
            >
              <span className="record-stage-ui__recording-dot" />
              録画中
            </span>
            <p
              className={`record-stage-ui__limit-msg${showLimitMessage ? "" : " record-stage-ui__dock-status-item--hidden"}`}
            >
              撮影時間を使い切りました
            </p>
          </div>

          <button
            type="button"
            onClick={onRecordPress}
            onPointerUp={(e) => {
              if (e.pointerType === "touch") {
                e.preventDefault();
                onRecordPress();
              }
            }}
            disabled={(!canRecord && !isRecording) || cameraStarting || recordingStarting}
            className={`record-stage-ui__record${isRecording ? " record-stage-ui__record--active" : ""}`}
            aria-label={isRecording ? "録画を停止" : "録画を開始"}
          >
            <span className="record-stage-ui__record-inner" />
          </button>
        </div>
      </div>
    </RecordStagePortal>
  );
}
