"use client";

import type { FollowStats } from "@/types/profile";

type ProfileStatsProps = {
  stats: FollowStats;
  onFollowersClick: () => void;
  onFollowingClick: () => void;
};

function StatButton({
  count,
  label,
  onClick,
}: {
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-2 py-1 text-left transition hover:bg-surface-elevated touch-manipulation"
    >
      <span className="block text-base font-semibold tabular-nums text-foreground">
        {count}
      </span>
      <span className="block text-xs text-muted">{label}</span>
    </button>
  );
}

export function ProfileStats({
  stats,
  onFollowersClick,
  onFollowingClick,
}: ProfileStatsProps) {
  return (
    <div className="mt-3 flex gap-2">
      <StatButton
        count={stats.followerCount}
        label="フォロワー"
        onClick={onFollowersClick}
      />
      <StatButton
        count={stats.followingCount}
        label="フォロー中"
        onClick={onFollowingClick}
      />
    </div>
  );
}
