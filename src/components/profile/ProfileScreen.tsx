"use client";

import { ReportButton } from "@/components/reports/ReportButton";
import { BlockUserButton } from "@/components/blocks/BlockUserButton";
import { unblockUser } from "@/lib/blocks/actions";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { ConfirmDeleteVideoDialog } from "@/components/profile/ConfirmDeleteVideoDialog";
import { EditProfileModal } from "@/components/profile/EditProfileModal";
import { FollowButton } from "@/components/profile/FollowButton";
import { FollowListModal } from "@/components/profile/FollowListModal";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { ProfileStats } from "@/components/profile/ProfileStats";
import { ProfileVideoTile } from "@/components/profile/ProfileVideoTile";
import { FullscreenPlayer } from "@/components/home/FullscreenPlayer";
import { fetchFollowStats } from "@/lib/social/follows";
import { deleteOwnVideo } from "@/lib/videos/delete";
import {
  fetchCurrentProfile,
  fetchProfile,
  fetchUserVideos,
} from "@/lib/videos/profile-feed";
import { NAV_CACHE_KEYS, readNavCache, writeNavCache } from "@/lib/cache/nav-data-cache";
import {
  refreshOwnProfileCache,
  type OwnProfileCacheData,
} from "@/lib/prefetch/prefetch-nav-data";
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
  const [likesLoading, setLikesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FeedVideo | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [unblocking, setUnblocking] = useState(false);

  const applyOwnProfile = useCallback((data: OwnProfileCacheData) => {
    setProfile(data.profile);
    setFollowStats(data.followStats);
    setUserVideos(data.userVideos);
    setLikedVideos(data.likedVideos);
    setIsOwnProfile(true);
    setIsBlocked(false);
    setLikesLoading(false);
    setLoading(false);
  }, []);

  const loadOtherProfile = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!userIdProp) return;
    if (!silent) {
      setLoading(true);
      setLikesLoading(false);
    }
    setError(null);
    try {
      const current = await fetchCurrentProfile();
      const targetUserId = userIdProp;
      const own = targetUserId === current.userId;
      if (own) {
        // Rare: /profile/[id] for self — use shared own-profile path.
        const data = await refreshOwnProfileCache();
        applyOwnProfile(data);
        return;
      }

      const blockedIds = await fetchBlockedUserIds();
      const blocked = blockedIds.has(targetUserId);
      setIsBlocked(blocked);

      const [p, stats, videos] = await Promise.all([
        fetchProfile(targetUserId),
        fetchFollowStats(targetUserId),
        fetchUserVideos(targetUserId),
      ]);

      setProfile(p);
      setFollowStats(stats);
      setIsOwnProfile(false);
      setUserVideos(blocked ? [] : videos);
      setLikedVideos([]);
      setTab("videos");
      setLikesLoading(false);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      }
    } finally {
      setLoading(false);
    }
  }, [applyOwnProfile, userIdProp]);

  const loadOwnProfile = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setLikesLoading(true);
    }
    setError(null);
    try {
      const data = await refreshOwnProfileCache({
        onCoreReady: silent
          ? undefined
          : (core) => {
              setProfile(core.profile);
              setFollowStats(core.followStats);
              setUserVideos(core.userVideos);
              setIsOwnProfile(true);
              setIsBlocked(false);
              // Unlock header + 投稿 grid; likes tab keeps its own spinner.
              setLoading(false);
              setLikesLoading(true);
            },
      });
      applyOwnProfile(data);
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      }
      setLikesLoading(false);
      setLoading(false);
    }
  }, [applyOwnProfile]);

  useEffect(() => {
    if (userIdProp) {
      void loadOtherProfile();
      return;
    }

    const cached = readNavCache<OwnProfileCacheData>(NAV_CACHE_KEYS.OWN_PROFILE);
    if (cached) {
      applyOwnProfile(cached.data);
      void loadOwnProfile({ silent: true });
    } else {
      void loadOwnProfile();
    }
  }, [userIdProp, applyOwnProfile, loadOwnProfile, loadOtherProfile]);

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (userIdProp) {
        await loadOtherProfile(options);
      } else {
        await loadOwnProfile(options);
      }
    },
    [userIdProp, loadOtherProfile, loadOwnProfile],
  );

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
                <UserIdentity
                  username={profile.username}
                  displayName={profile.displayName}
                  size="lg"
                  layout="stack"
                />
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
        ) : isOwnProfile && tab === "likes" && likesLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* Likes still loading: show posts so the grid is usable immediately. */}
            <VideoGrid
              videos={userVideos}
              emptyMessage="投稿した動画はまだありません"
              deletable
              onSelect={setSelected}
              onDeleteRequest={handleDeleteRequest}
            />
            <p className="col-span-3 pt-2 text-center text-xs text-muted">
              いいね一覧を読み込み中…
            </p>
          </div>
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
        <FullscreenPlayer
          video={selected}
          onClose={() => setSelected(null)}
          onVideoDeleted={(videoId) => {
            setUserVideos((prev) => prev.filter((v) => v.id !== videoId));
            setLikedVideos((prev) => prev.filter((v) => v.id !== videoId));
            void load({ silent: true });
          }}
        />
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
          onUpdated={(updates) => {
            setProfile((prev) => {
              if (!prev) return prev;
              const next = { ...prev, ...updates };
              writeNavCache<OwnProfileCacheData>(NAV_CACHE_KEYS.OWN_PROFILE, {
                profile: next,
                followStats: followStats ?? {
                  followerCount: 0,
                  followingCount: 0,
                  isFollowing: false,
                },
                userVideos,
                likedVideos,
              });
              return next;
            });
          }}
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
