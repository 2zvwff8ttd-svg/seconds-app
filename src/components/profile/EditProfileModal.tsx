"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { uploadProfileAvatar } from "@/lib/storage/avatars";
import {
  ProfileUpdateError,
  updateOwnProfile,
} from "@/lib/profile/update-profile";
import type { ProfileData } from "@/types/profile";
import { useRef, useState } from "react";

type EditProfileModalProps = {
  profile: ProfileData;
  onClose: () => void;
  onUpdated: (
    updates: Partial<Pick<ProfileData, "avatarUrl" | "username" | "displayName">>,
  ) => void;
};

export function EditProfileModal({
  profile,
  onClose,
  onUpdated,
}: EditProfileModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [username, setUsername] = useState(profile.username);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayAvatar = previewUrl ?? profile.avatarUrl;
  const busy = uploading || saving;

  const handlePick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);

    try {
      const avatarUrl = await uploadProfileAvatar(file);
      onUpdated({ avatarUrl });
      onClose();
    } catch (err) {
      setPreviewUrl(null);
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleSaveProfile = async () => {
    setError(null);
    setSaving(true);
    try {
      const result = await updateOwnProfile({
        userId: profile.userId,
        currentUsername: profile.username,
        displayNameRaw: displayName,
        usernameRaw: username,
      });
      onUpdated({
        displayName: result.displayName,
        username: result.username,
      });
      onClose();
    } catch (err) {
      setError(
        err instanceof ProfileUpdateError
          ? err.message
          : err instanceof Error
            ? err.message
            : "保存に失敗しました",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="z-fullscreen fixed inset-0 flex items-end justify-center bg-black/70 p-4 sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="edit-profile-title"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="edit-profile-title"
          className="text-lg font-semibold text-foreground"
        >
          Edit Profile
        </h2>
        <p className="mt-1 text-xs text-muted">
          表示名・ユーザー名・プロフィール画像を変更できます
        </p>

        <div className="mt-6 flex flex-col items-center">
          <ProfileAvatar
            username={username}
            avatarUrl={displayAvatar}
            size="lg"
          />
          <div className="mt-3">
            <UserIdentity
              username={username}
              displayName={displayName}
              size="md"
              layout="stack"
              className="items-center text-center"
            />
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="edit-display-name"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              表示名
            </label>
            <input
              id="edit-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={30}
              placeholder={profile.username}
              disabled={busy}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-violet-400/50 focus:outline-none disabled:opacity-50"
            />
            <p className="mt-1 text-[10px] text-muted">
              日本語・絵文字OK。空欄の場合は @ユーザー名が表示されます
            </p>
          </div>

          <div>
            <label
              htmlFor="edit-username"
              className="mb-1.5 block text-xs font-medium text-muted"
            >
              ユーザー名（@ハンドル）
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                @
              </span>
              <input
                id="edit-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                maxLength={30}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={busy}
                className="w-full rounded-xl border border-border bg-surface py-2.5 pl-7 pr-3 text-sm text-foreground focus:border-violet-400/50 focus:outline-none disabled:opacity-50"
              />
            </div>
            <p className="mt-1 text-[10px] text-muted">
              半角英数字とアンダースコア、2〜30文字
            </p>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/*"
          className="sr-only"
          onChange={(e) => void handleFileChange(e)}
        />

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleSaveProfile()}
            disabled={busy}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            type="button"
            onClick={handlePick}
            disabled={busy}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
          >
            {uploading ? "アップロード中…" : "写真を選択"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
