"use client";

import { useCallback, useEffect, useRef } from "react";

const BGM_VOLUME = 0.4;

type UseBgmPlaybackOptions = {
  bgmUrl?: string;
  /** プレイヤーセッション単位（動画 ID が変わったら BGM を作り直す） */
  sessionKey: string;
  active: boolean;
};

/**
 * BGM を動画クリップ切り替えから独立して連続再生する。
 * video 要素の play/pause には追従せず、呼び出し側が明示的に制御する。
 */
export function useBgmPlayback({
  bgmUrl,
  sessionKey,
  active,
}: UseBgmPlaybackOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!bgmUrl || !active) return;

    const audio = new Audio(bgmUrl);
    audio.loop = true;
    audio.volume = BGM_VOLUME;
    audio.preload = "auto";
    audioRef.current = audio;

    void audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      // Force the element to drop the decoded audio buffer (iOS retention).
      audio.load();
      audioRef.current = null;
    };
  }, [bgmUrl, sessionKey, active]);

  const play = useCallback(() => {
    void audioRef.current?.play().catch(() => {});
  }, []);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  return { play, pause };
}
