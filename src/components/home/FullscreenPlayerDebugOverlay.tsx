"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const READY_STATE_LABELS = [
  "HAVE_NOTHING(0)",
  "HAVE_METADATA(1)",
  "HAVE_CURRENT_DATA(2)",
  "HAVE_FUTURE_DATA(3)",
  "HAVE_ENOUGH_DATA(4)",
] as const;

const NETWORK_STATE_LABELS = [
  "NETWORK_EMPTY(0)",
  "NETWORK_IDLE(1)",
  "NETWORK_LOADING(2)",
  "NETWORK_NO_SOURCE(3)",
] as const;

const MEDIA_ERROR_LABELS: Record<number, string> = {
  1: "MEDIA_ERR_ABORTED(1)",
  2: "MEDIA_ERR_NETWORK(2)",
  3: "MEDIA_ERR_DECODE(3)",
  4: "MEDIA_ERR_SRC_NOT_SUPPORTED(4)",
};

type VideoDebugSnapshot = {
  readyState: number;
  readyStateLabel: string;
  networkState: number;
  networkStateLabel: string;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  srcFile: string;
  errorCode: number | null;
  errorMessage: string | null;
  showVideoSurface: boolean;
  flipVisible: boolean;
  audioOnlySuspect: boolean;
  sampledAt: string;
};

function basenameFromSrc(src: string): string {
  if (!src) return "(empty)";
  try {
    const path = new URL(src, "https://local.invalid").pathname;
    const parts = path.split("/");
    return parts[parts.length - 1] || src;
  } catch {
    const parts = src.split("/");
    return parts[parts.length - 1] || src;
  }
}

function formatMediaError(el: HTMLVideoElement): {
  code: number | null;
  message: string | null;
} {
  const err = el.error;
  if (!err) return { code: null, message: null };
  return {
    code: err.code,
    message: err.message?.trim() || MEDIA_ERROR_LABELS[err.code] || "unknown",
  };
}

function readSnapshot(
  el: HTMLVideoElement | null,
  showVideoSurface: boolean,
  flipVisible: boolean,
): VideoDebugSnapshot {
  const now = new Date();
  const time = `${now.toLocaleTimeString("ja-JP", { hour12: false })}.${String(now.getMilliseconds()).padStart(3, "0")}`;

  if (!el) {
    return {
      readyState: -1,
      readyStateLabel: "no <video>",
      networkState: -1,
      networkStateLabel: "no <video>",
      videoWidth: 0,
      videoHeight: 0,
      currentTime: 0,
      duration: 0,
      paused: true,
      ended: false,
      muted: false,
      srcFile: "(no element)",
      errorCode: null,
      errorMessage: null,
      showVideoSurface,
      flipVisible,
      audioOnlySuspect: false,
      sampledAt: time,
    };
  }

  const { code, message } = formatMediaError(el);
  const audioOnlySuspect =
    !el.paused &&
    el.currentTime > 0.05 &&
    (el.videoWidth === 0 || el.videoHeight === 0);

  return {
    readyState: el.readyState,
    readyStateLabel:
      READY_STATE_LABELS[el.readyState] ?? `unknown(${el.readyState})`,
    networkState: el.networkState,
    networkStateLabel:
      NETWORK_STATE_LABELS[el.networkState] ??
      `unknown(${el.networkState})`,
    videoWidth: el.videoWidth,
    videoHeight: el.videoHeight,
    currentTime: el.currentTime,
    duration: Number.isFinite(el.duration) ? el.duration : 0,
    paused: el.paused,
    ended: el.ended,
    muted: el.muted,
    srcFile: basenameFromSrc(el.currentSrc || el.src),
    errorCode: code,
    errorMessage: message,
    showVideoSurface,
    flipVisible,
    audioOnlySuspect,
    sampledAt: time,
  };
}

function snapshotSignature(s: VideoDebugSnapshot): string {
  return [
    s.readyState,
    s.networkState,
    s.videoWidth,
    s.videoHeight,
    s.paused,
    s.ended,
    s.errorCode,
    s.srcFile,
    s.showVideoSurface,
    s.flipVisible,
    s.audioOnlySuspect,
  ].join("|");
}

type FullscreenPlayerDebugOverlayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  showVideoSurface: boolean;
  flipVisible: boolean;
  videoId: string;
};

export function FullscreenPlayerDebugOverlay({
  videoRef,
  showVideoSurface,
  flipVisible,
  videoId,
}: FullscreenPlayerDebugOverlayProps) {
  const [enabled, setEnabled] = useState(false);
  const [snapshot, setSnapshot] = useState<VideoDebugSnapshot | null>(null);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const lastSignatureRef = useRef("");
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEnabled(params.get("debug") === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const el = videoRef.current;
    if (!el) return;

    const appendLog = (line: string) => {
      setEventLog((prev) => [line, ...prev].slice(0, 12));
    };

    const mediaEvents = [
      "loadstart",
      "loadedmetadata",
      "loadeddata",
      "canplay",
      "canplaythrough",
      "playing",
      "waiting",
      "stalled",
      "suspend",
      "pause",
      "play",
      "ended",
      "error",
      "emptied",
      "abort",
      "timeupdate",
    ] as const;

    const onMediaEvent = (event: Event) => {
      const v = videoRef.current;
      if (!v) return;
      const err = formatMediaError(v);
      const errPart =
        event.type === "error" && err.code != null
          ? ` err=${err.code} ${err.message ?? ""}`
          : "";
      appendLog(
        `${event.type} t=${v.currentTime.toFixed(2)} rs=${v.readyState} ` +
          `dim=${v.videoWidth}x${v.videoHeight}${errPart}`,
      );
    };

    for (const name of mediaEvents) {
      el.addEventListener(name, onMediaEvent);
    }

    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const next = readSnapshot(v, showVideoSurface, flipVisible);
      setSnapshot(next);

      const sig = snapshotSignature(next);
      if (sig !== lastSignatureRef.current) {
        lastSignatureRef.current = sig;
        appendLog(
          `Δ rs=${next.readyState} net=${next.networkState} ` +
            `dim=${next.videoWidth}x${next.videoHeight} ` +
            `t=${next.currentTime.toFixed(2)}/${next.duration.toFixed(2)} ` +
            `paused=${next.paused} audioOnly=${next.audioOnlySuspect}`,
        );
      } else if (
        v &&
        !v.paused &&
        v.currentTime - lastTimeRef.current >= 1
      ) {
        lastTimeRef.current = v.currentTime;
        appendLog(
          `♦ tick t=${next.currentTime.toFixed(2)} rs=${next.readyState} ` +
            `dim=${next.videoWidth}x${next.videoHeight}`,
        );
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(raf);
      for (const name of mediaEvents) {
        el.removeEventListener(name, onMediaEvent);
      }
    };
  }, [enabled, videoRef, showVideoSurface, flipVisible, videoId]);

  if (!enabled || !snapshot) return null;

  const warnClass = snapshot.audioOnlySuspect
    ? "border-red-500 bg-red-950/90"
    : snapshot.errorCode != null
      ? "border-amber-500 bg-amber-950/90"
      : "border-emerald-600/80 bg-black/85";

  return (
    <div
      className={`pointer-events-none absolute left-1 top-1 z-[60] max-w-[min(100%,20rem)] rounded-md border px-2 py-1.5 font-mono text-[10px] leading-snug text-white shadow-lg backdrop-blur-sm sm:left-2 sm:top-2 sm:text-[11px] ${warnClass}`}
      aria-hidden
    >
      <div className="mb-1 font-semibold text-emerald-300">debug=1 · slot0</div>
      <div>readyState: {snapshot.readyStateLabel}</div>
      <div>networkState: {snapshot.networkStateLabel}</div>
      <div>
        video: {snapshot.videoWidth}×{snapshot.videoHeight}
        {snapshot.videoWidth === 0 || snapshot.videoHeight === 0 ? (
          <span className="text-red-300"> ← no video track</span>
        ) : null}
      </div>
      <div>
        time: {snapshot.currentTime.toFixed(2)} / {snapshot.duration.toFixed(2)}
      </div>
      <div>
        paused: {String(snapshot.paused)} · ended: {String(snapshot.ended)} ·
        muted: {String(snapshot.muted)}
      </div>
      <div>src: {snapshot.srcFile}</div>
      <div>
        error:{" "}
        {snapshot.errorCode != null
          ? `${snapshot.errorCode} ${snapshot.errorMessage ?? ""}`
          : "none"}
      </div>
      <div>
        UI: showVideoSurface={String(snapshot.showVideoSurface)} flipVisible=
        {String(snapshot.flipVisible)}
      </div>
      {snapshot.audioOnlySuspect ? (
        <div className="mt-1 font-semibold text-red-300">
          ⚠ audio-only suspect (playing, dim=0)
        </div>
      ) : null}
      <div className="mt-1 text-white/50">sampled {snapshot.sampledAt}</div>
      {eventLog.length > 0 ? (
        <div className="mt-1 max-h-28 overflow-hidden border-t border-white/20 pt-1 text-[9px] text-white/80">
          {eventLog.map((line, i) => (
            <div key={`${i}-${line.slice(0, 24)}`} className="truncate">
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
