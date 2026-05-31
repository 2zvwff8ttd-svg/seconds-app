"use client";

import { FullscreenPlayer } from "@/components/home/FullscreenPlayer";
import {
  fetchCurrentProfile,
  fetchLikedVideos,
  fetchMyVideos,
} from "@/lib/videos/profile-feed";
import type { FeedVideo } from "@/types/feed";
import { useCallback, useEffect, useState } from "react";

type Tab = "likes" | "videos";

function VideoGrid({
  videos,
  emptyMessage,
  onSelect,
}: {
  videos: FeedVideo[];
  emptyMessage: string;
  onSelect: (video: FeedVideo) => void;
}) {
  if (videos.length === 0) {
    return (
      <p className="col-span-3 py-16 text-center text-sm text-muted">{emptyMessage}</p>
    );
  }

  return videos.map((video) => (
    <button
      key={video.id}
      type="button"
      onClick={() => onSelect(video)}
      className="group relative aspect-[9/16] overflow-hidden rounded-lg border border-border bg-black"
    >
      {video.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : (
        <div className="flex h-full items-center justify-center bg-surface text-xs text-muted">
          No thumb
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <p className="line-clamp-2 text-left text-[10px] font-medium text-foreground">
          {video.title}
        </p>
      </div>
    </button>
  ));
}

export function ProfileScreen() {
  const [profile, setProfile] = useState<Awaited<
    ReturnType<typeof fetchCurrentProfile>
  > | null>(null);
  const [tab, setTab] = useState<Tab>("likes");
  const [likedVideos, setLikedVideos] = useState<FeedVideo[]>([]);
  const [myVideos, setMyVideos] = useState<FeedVideo[]>([]);
  const [selected, setSelected] = useState<FeedVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const p = await fetchCurrentProfile();
      const [liked, mine] = await Promise.all([
        fetchLikedVideos(p.userId),
        fetchMyVideos(p.userId),
      ]);
      setProfile(p);
      setLikedVideos(liked);
      setMyVideos(mine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
        {loading && !profile ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : profile ? (
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 text-xl font-bold text-violet-200">
              {profile.username.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">@{profile.username}</h2>
              {profile.bio && (
                <p className="mt-1 text-sm text-muted">{profile.bio}</p>
              )}
              <p className="mt-1 text-xs text-muted">{profile.country}</p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex gap-1 rounded-xl bg-surface p-1">
          <button
            type="button"
            onClick={() => setTab("likes")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === "likes"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            いいね
          </button>
          <button
            type="button"
            onClick={() => setTab("videos")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
              tab === "videos"
                ? "bg-surface-elevated text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            投稿
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-center text-sm text-muted">読み込み中…</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {tab === "likes" ? (
              <VideoGrid
                videos={likedVideos}
                emptyMessage="いいねした動画はまだありません"
                onSelect={setSelected}
              />
            ) : (
              <VideoGrid
                videos={myVideos}
                emptyMessage="投稿した動画はまだありません"
                onSelect={setSelected}
              />
            )}
          </div>
        )}
      </div>

      {selected && (
        <FullscreenPlayer video={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
