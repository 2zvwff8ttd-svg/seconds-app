"use client";

import { fetchPresetBgmTracks } from "@/lib/storage/music";
import type { PresetBgmTrack } from "@/types/preset-bgm";
import { useCallback, useEffect, useRef, useState } from "react";

type PresetBgmPickerProps = {
  selectedId: string | null;
  onSelect: (track: PresetBgmTrack) => void;
  disabled?: boolean;
};

export function PresetBgmPicker({
  selectedId,
  onSelect,
  disabled = false,
}: PresetBgmPickerProps) {
  const [tracks, setTracks] = useState<PresetBgmTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const stopPreview = useCallback(() => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    setPlayingId(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPresetBgmTracks()
      .then((list) => {
        if (!cancelled) setTracks(list);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "曲一覧の取得に失敗しました");
          setTracks([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const handlePreview = async (track: PresetBgmTrack) => {
    if (disabled) return;
    if (playingId === track.id) {
      stopPreview();
      return;
    }
    stopPreview();
    const audio = new Audio(track.publicUrl);
    previewAudioRef.current = audio;
    audio.onended = () => setPlayingId(null);
    audio.onerror = () => {
      setPlayingId(null);
      setError("試聴の再生に失敗しました");
    };
    try {
      await audio.play();
      setPlayingId(track.id);
    } catch {
      setError("試聴の再生に失敗しました");
    }
  };

  const handleSelect = (track: PresetBgmTrack) => {
    if (disabled) return;
    setError(null);
    onSelect(track);
  };

  return (
    <div className="mt-3 rounded-lg border border-border bg-black/40">
      <div className="border-b border-border/80 px-3 py-2">
        <p className="text-xs font-medium text-foreground">プリセット BGM</p>
        <p className="text-[10px] text-muted">曲を選ぶと視聴時に動画と一緒に再生されます</p>
      </div>

      {loading && (
        <p className="flex items-center gap-2 px-3 py-4 text-xs text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
          曲一覧を読み込み中…
        </p>
      )}

      {!loading && error && (
        <p className="px-3 py-3 text-xs text-red-400">{error}</p>
      )}

      {!loading && !error && tracks.length === 0 && (
        <p className="px-3 py-4 text-xs leading-relaxed text-muted">
          プリセット曲がありません。Supabase Storage の{" "}
          <code className="rounded bg-surface px-1 text-[10px] text-foreground/80">music</code>{" "}
          バケットに MP3 などをアップロードしてください。
        </p>
      )}

      {!loading && tracks.length > 0 && (
        <ul className="max-h-48 divide-y divide-border/60 overflow-y-auto overscroll-contain">
          {tracks.map((track) => {
            const selected = selectedId === track.id;
            const isPlaying = playingId === track.id;
            return (
              <li key={track.id}>
                <div
                  className={`flex items-center gap-2 px-3 py-2.5 transition ${
                    selected ? "bg-violet-500/15" : "hover:bg-white/5"
                  }`}
                >
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void handlePreview(track)}
                    aria-label={isPlaying ? `${track.name}の試聴を停止` : `${track.name}を試聴`}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-violet-300 transition hover:border-violet-400/50 hover:bg-violet-500/20 disabled:opacity-40"
                  >
                    {isPlaying ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                        <rect x="6" y="5" width="4" height="14" rx="1" />
                        <rect x="14" y="5" width="4" height="14" rx="1" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelect(track)}
                    className="min-w-0 flex-1 text-left disabled:opacity-50"
                  >
                    <span className="block truncate text-sm font-medium text-foreground">
                      {track.name}
                    </span>
                    <span className="block truncate text-[10px] text-muted">
                      {selected ? "選択中 · 視聴時に再生" : "タップして選択"}
                    </span>
                  </button>

                  {selected && (
                    <span
                      className="shrink-0 rounded-full bg-violet-500/25 px-2 py-0.5 text-[9px] font-medium text-violet-200"
                      aria-hidden
                    >
                      ✓
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
