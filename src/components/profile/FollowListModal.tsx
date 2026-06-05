"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { fetchFollowers, fetchFollowing } from "@/lib/social/follows";
import type { FollowListKind, FollowListUser } from "@/types/profile";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const TITLES: Record<FollowListKind, string> = {
  followers: "フォロワー",
  following: "フォロー中",
};

type FollowListModalProps = {
  userId: string;
  kind: FollowListKind;
  onClose: () => void;
};

function UserRow({
  user,
  onSelect,
}: {
  user: FollowListUser;
  onSelect: (userId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(user.userId)}
      className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-border hover:bg-surface-elevated"
    >
      <ProfileAvatar
        username={user.username}
        avatarUrl={user.avatarUrl}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        @{user.username}
      </span>
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4 shrink-0 text-muted"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

export function FollowListModal({ userId, kind, onClose }: FollowListModalProps) {
  const router = useRouter();
  const [users, setUsers] = useState<FollowListUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list =
        kind === "followers"
          ? await fetchFollowers(userId)
          : await fetchFollowing(userId);
      setUsers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "一覧の取得に失敗しました");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [userId, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleSelectUser = (targetUserId: string) => {
    onClose();
    router.push(`/profile/${targetUserId}`);
  };

  return (
    <div
      className="z-fullscreen fixed inset-0 flex flex-col justify-end bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-labelledby="follow-list-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
      />

      <div className="relative flex max-h-[min(70dvh,520px)] min-h-[40dvh] flex-col rounded-t-2xl border border-border bg-surface shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 id="follow-list-title" className="text-base font-semibold text-foreground">
            {TITLES[kind]}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-elevated hover:text-foreground"
            aria-label="閉じる"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {loading && (
            <p className="py-12 text-center text-sm text-muted">読み込み中…</p>
          )}

          {error && (
            <div className="py-8 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="mt-2 text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
              >
                再試行
              </button>
            </div>
          )}

          {!loading && !error && users.length === 0 && (
            <p className="py-12 text-center text-sm text-muted">
              {kind === "followers"
                ? "フォロワーはまだいません"
                : "フォロー中のユーザーはいません"}
            </p>
          )}

          {!loading && !error && users.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {users.map((user) => (
                <li key={user.userId}>
                  <UserRow user={user} onSelect={handleSelectUser} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
