"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { uploadProfileAvatar } from "@/lib/storage/avatars";
import type { ProfileData } from "@/types/profile";
import { useRef, useState } from "react";

type EditProfileModalProps = {
  profile: ProfileData;
  onClose: () => void;
  onUpdated: (avatarUrl: string) => void;
};

export function EditProfileModal({
  profile,
  onClose,
  onUpdated,
}: EditProfileModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayAvatar = previewUrl ?? profile.avatarUrl;

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
      onUpdated(avatarUrl);
      onClose();
    } catch (err) {
      setPreviewUrl(null);
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
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
        className="w-full max-w-md rounded-2xl border border-border bg-surface-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="edit-profile-title"
          className="text-lg font-semibold text-foreground"
        >
          Edit Profile
        </h2>
        <p className="mt-1 text-xs text-muted">
          カメラロールからプロフィール画像を選べます
        </p>

        <div className="mt-6 flex flex-col items-center">
          <ProfileAvatar
            username={profile.username}
            avatarUrl={displayAvatar}
            size="lg"
          />
          <p className="mt-3 text-sm font-medium text-foreground">
            @{profile.username}
          </p>
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
            onClick={handlePick}
            disabled={uploading}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? "アップロード中…" : "写真を選択"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
