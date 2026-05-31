"use client";

import { fetchFollowStats, toggleFollow } from "@/lib/social/follows";
import type { FollowStats } from "@/types/profile";
import { useState } from "react";

type FollowButtonProps = {
  userId: string;
  initialStats: FollowStats;
  onStatsChange?: (stats: FollowStats) => void;
};

export function FollowButton({
  userId,
  initialStats,
  onStatsChange,
}: FollowButtonProps) {
  const [stats, setStats] = useState(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    const wasFollowing = stats.isFollowing;
    const previous = stats;
    const optimistic: FollowStats = {
      ...previous,
      isFollowing: !wasFollowing,
      followerCount: wasFollowing
        ? Math.max(0, previous.followerCount - 1)
        : previous.followerCount + 1,
    };
    setStats(optimistic);
    try {
      const next = await toggleFollow(userId, wasFollowing);
      setStats(next);
      onStatsChange?.(next);
    } catch (err) {
      setStats(previous);
      setError(err instanceof Error ? err.message : "フォローに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full sm:w-auto">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        className={`w-full rounded-xl px-5 py-2.5 text-sm font-semibold transition touch-manipulation disabled:opacity-50 sm:w-auto ${
          stats.isFollowing
            ? "border border-border bg-surface text-foreground hover:bg-white/5"
            : "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25 hover:opacity-90"
        }`}
      >
        {loading ? "処理中…" : stats.isFollowing ? "フォロー中" : "フォローする"}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
