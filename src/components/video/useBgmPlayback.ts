"use client";

import { useEffect, useRef } from "react";

const BGM_VOLUME = 0.4;

type UseBgmPlaybackOptions = {
  bgmUrl?: string;
  active: boolean;
};

/**
 * 動画と BGM を同期再生（動画はミュート、BGM をループ）
 */
export function useBgmPlayback(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  { bgmUrl, active }: UseBgmPlaybackOptions,
) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !bgmUrl || !active) return;

    const audio = new Audio(bgmUrl);
    audio.loop = true;
    audio.volume = BGM_VOLUME;
    audio.preload = "auto";
    audioRef.current = audio;

    video.muted = true;

    const syncPlay = () => {
      void audio.play().catch(() => {});
    };
    const syncPause = () => {
      audio.pause();
    };

    const onSeeking = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const t = video.currentTime % (audio.duration || video.duration);
      if (Number.isFinite(t)) audio.currentTime = t;
    };

    video.addEventListener("play", syncPlay);
    video.addEventListener("pause", syncPause);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("ended", syncPause);

    if (!video.paused) syncPlay();

    return () => {
      video.removeEventListener("play", syncPlay);
      video.removeEventListener("pause", syncPause);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("ended", syncPause);
      audio.pause();
      audio.src = "";
      audioRef.current = null;
      video.muted = false;
    };
  }, [videoRef, bgmUrl, active]);

  return audioRef;
}
