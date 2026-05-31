"use client";

import { FullscreenPlayer } from "@/components/home/FullscreenPlayer";
import { fetchVideoById } from "@/lib/videos/fetch-video";
import type { FeedVideo } from "@/types/feed";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const videoId = params.id;
  const router = useRouter();
  const [video, setVideo] = useState<FeedVideo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoId) return;
    setLoading(true);
    setError(null);
    fetchVideoById(videoId)
      .then((row) => {
        if (!row) {
          setError("動画が見つかりません");
          setVideo(null);
        } else {
          setVideo(row);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
        setVideo(null);
      })
      .finally(() => setLoading(false));
  }, [videoId]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black">
        <p className="text-sm text-muted">読み込み中…</p>
      </div>
    );
  }

  if (error || !video) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-4 bg-black px-6 text-center">
        <p className="text-sm text-red-400">{error ?? "動画が見つかりません"}</p>
        <Link
          href="/"
          className="rounded-xl border border-border bg-surface px-4 py-2 text-sm text-foreground"
        >
          ホームに戻る
        </Link>
      </div>
    );
  }

  return (
    <FullscreenPlayer
      video={video}
      onClose={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push("/");
        }
      }}
    />
  );
}
