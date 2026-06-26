"use client";

import { ReportButton } from "@/components/reports/ReportButton";
import { BlockUserButton } from "@/components/blocks/BlockUserButton";
import { unblockUser } from "@/lib/blocks/actions";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { filterVideosByBlocked } from "@/lib/blocks/filter";
import { ConfirmDeleteVideoDialog } from "@/components/profile/ConfirmDeleteVideoDialog";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { FollowButton } from "@/components/profile/FollowButton";
import { FollowListModal } from "@/components/profile/FollowListModal";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { ProfileVideoTile } from "@/components/profile/ProfileVideoTile";
import { FullscreenPlayer } from "@/components/home/FullscreenPlayer";
import { fetchFollowStats } from "@/lib/social/follows";
import { deleteOwnVideo } from "@/lib/videos/delete";
import {
  fetchCurrentProfile,
  fetchLikedVideos,
  fetchProfile,
  fetchUserVideos,
} from "@/lib/videos/profile-feed";
import { NAV_CACHE_KEYS, readNavCache, writeNavCache } from "@/lib/cache/nav-data-cache";
import type { OwnProfileCacheData } from "@/lib/prefetch/prefetch-nav-data";
import type { FeedVideo } from "@/types/feed";
import type { FollowListKind, FollowStats, ProfileData } from "@/types/profile";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Tab = "likes" | "videos";

function VideoGrid({
  videos,
  emptyMessage,
  deletable,
  onSelect,
  onDeleteRequest,
}: {
  videos: FeedVideo[];
  emptyMessage: string;
  deletable?: boolean;
  onSelect: (video: FeedVideo) => void;
  onDeleteRequest: (video: FeedVideo) => void;
}) {
  if (videos.length === 0) {
    return (
      <p className="col-span-3 py-16 text-center text-sm text-muted">{emptyMessage}</p>
    );
  }

  return videos.map((video) => (
    <ProfileVideoTile
      key={video.id}
      video={video}
      deletable={deletable}
      onSelect={onSelect}
      onDeleteRequest={onDeleteRequest}
    />
  ));
}

type ProfileScreenProps = {
  /** 省略時はログインユーザー自身 */
  userId?: string;
};

export function ProfileScreen({ userId: userIdProp }: ProfileScreenProps) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [followStats, setFollowStats] = useState<FollowStats | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(true);
  const [tab, setTab] = useState<Tab>("likes");
  const [likedVideos, setLikedVideos] = useState<FeedVideo[]>([]);
  const [userVideos, setUserVideos] = useState<FeedVideo[]>([]);
  const [selected, setSelected] = useState<FeedVideo | null>(null);
  const [followListKind, setFollowListKind] = useState<FollowListKind | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FeedVideo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const current = await fetchCurrentProfile();
      const targetUserId = userIdProp ?? current.userId;
      const own = targetUserId === current.userId;

      const blockedIds = await fetchBlockedUserIds();
      const blocked = !own && blockedIds.has(targetUserId);
      setIsBlocked(blocked);

      const [p, stats, videos] = await Promise.all([
        own ? Promise.resolve(current) : fetchProfile(targetUserId),
        fetchFollowStats(targetUserId),
        fetchUserVideos(targetUserId),
      ]);

      setProfile(p);
      setFollowStats(stats);
      setIsOwnProfile(own);
      setUserVideos(blocked ? [] : videos);

      if (own) {
        const liked = await fetchLikedVideos(targetUserId);
        const filteredLiked = filterVideosByBlocked(liked, blockedIds);
        setLikedVideos(filteredLiked);
        setTab((t) => (t === "likes" ? "likes" : t));
        writeNavCache<OwnProfileCacheData>(NAV_CACHE_KEYS.OWN_PROFILE, {
          profile: p,
          followStats: stats,
          userVideos: blocked ? [] : videos,
          likedVideos: filteredLiked,
        });
      } else {
        setLikedVideos([]);
        setTab("videos");
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      }
    } finally {
      setLoading(false);
    }
  }, [userIdProp]);

  useEffect(() => {
    if (userIdProp) {
      void load();
      return;
    }

    const cached = readNavCache<OwnProfileCacheData>(NAV_CACHE_KEYS.OWN_PROFILE);
    if (cached) {
      setProfile(cached.data.profile);
      setFollowStats(cached.data.followStats);
      setUserVideos(cached.data.userVideos);
      setLikedVideos(cached.data.likedVideos);
      setIsOwnProfile(true);
      setIsBlocked(false);
      setLoading(false);
      void load({ silent: true });
    } else {
      void load();
    }
  }, [userIdProp, load]);

  const handleDeleteRequest = (video: FeedVideo) => {
    setDeleteTarget(video);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    setError(null);
    try {
      await deleteOwnVideo(deleteTarget.id);
      setUserVideos((prev) => prev.filter((v) => v.id !== deleteTarget.id));
      if (selected?.id === deleteTarget.id) {
        setSelected(null);
      }
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗しました");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleUnblock = async () => {
    if (!profile) return;
    setUnblocking(true);
    setError(null);
    try {
      await unblockUser(profile.userId);
      setIsBlocked(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "解除に失敗しました");
    } finally {
      setUnblocking(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-4 py-4 sm:px-5">
        {loading && !profile ? (
          <p className="text-sm text-muted">読み込み中…</p>
        ) : profile ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <ProfileAvatar
                username={profile.username}
                avatarUrl={profile.avatarUrl}
                size="lg"
              />
              <div>
                <h2 className="text-lg font-bold text-foreground">@{profile.username}</h2>
                {profile.bio && (
                  <p className="mt-1 text-sm text-muted">{profile.bio}</p>
                )}
                <p className="mt-1 text-xs text-muted">{profile.country}</p>
                {followStats && !isBlocked && (
                  <ProfileStats
                    stats={followStats}
                    onFollowersClick={() => setFollowListKind("followers")}
                    onFollowingClick={() => setFollowListKind("following")}
                  />
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => setEditOpen(true)}
                  className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-violet-400/40 hover:bg-violet-500/10"
                >
                  Edit Profile
                </button>
              )}
              {!isOwnProfile && !isBlocked && (
                <div className="flex flex-col gap-2 sm:items-end">
                  {followStats && (
                    <FollowButton
                      userId={profile.userId}
                      initialStats={followStats}
                      onStatsChange={setFollowStats}
                    />
                  )}
                  <Link
                    href={`/messages/with/${profile.userId}`}
                    className="rounded-xl border border-border bg-surface px-4 py-2 text-center text-sm font-medium text-foreground transition hover:border-violet-400/40 hover:bg-violet-500/10"
                  >
                    メッセージ
                  </Link>
                  <BlockUserButton
                    userId={profile.userId}
                    username={profile.username}
                    onBlocked={() => {
                      setIsBlocked(true);
                      setUserVideos([]);
                      setFollowStats(null);
                    }}
                  />
                  <ReportButton
                    targetType="profile"
                    targetId={profile.userId}
                    targetLabel={`ユーザー @${profile.username}`}
                  />
                </div>
              )}
              {!isOwnProfile && isBlocked && (
                <div className="flex flex-col gap-2 sm:items-end">
                  <p className="text-xs text-muted">このユーザーをブロックしています</p>
                  <button
                    type="button"
                    onClick={() => void handleUnblock()}
                    disabled={unblocking}
                    className="rounded-xl border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-50"
                  >
                    {unblocking ? "解除中…" : "ブロックを解除"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {isOwnProfile ? (
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
        ) : (
          <p className="mt-4 text-xs text-muted">
            公開済みの動画のみ表示されます（フォロワー限定はフォロー中のみ）
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        {error && (
          <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-center text-sm text-muted">読み込み中…</p>
        ) : isBlocked ? (
          <p className="text-center text-sm text-muted">
            このユーザーの投稿は表示されません
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {isOwnProfile && tab === "likes" ? (
              <VideoGrid
                videos={likedVideos}
                emptyMessage="いいねした動画はまだありません"
                onSelect={setSelected}
                onDeleteRequest={handleDeleteRequest}
              />
            ) : (
              <VideoGrid
                videos={userVideos}
                emptyMessage={
                  isOwnProfile
                    ? "投稿した動画はまだありません"
                    : "表示できる動画はありません"
                }
                deletable={isOwnProfile && tab === "videos"}
                onSelect={setSelected}
                onDeleteRequest={handleDeleteRequest}
              />
            )}
          </div>
        )}
      </div>

      {selected && (
        <FullscreenPlayer video={selected} onClose={() => setSelected(null)} />
      )}

      {followListKind && profile && (
        <FollowListModal
          userId={profile.userId}
          kind={followListKind}
          onClose={() => setFollowListKind(null)}
        />
      )}

      {editOpen && profile && isOwnProfile && (
        <EditProfileModal
          profile={profile}
          onClose={() => setEditOpen(false)}
          onUpdated={(avatarUrl) =>
            setProfile((prev) =>
              prev ? { ...prev, avatarUrl } : prev,
            )
          }
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteVideoDialog
          title={deleteTarget.title}
          deleting={deleting}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={() => void handleDeleteConfirm()}
        />
      )}
    </div>
  );
}
