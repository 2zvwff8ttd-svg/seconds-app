"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import {
  ProfilePhotoClientError,
  base64ToObjectUrl,
  requestIdPhotoTransform,
} from "@/lib/ai/profile-photo-client";
import {
  ProfileUpdateError,
  updateOwnProfile,
} from "@/lib/profile/update-profile";
import {
  convertPngBase64ToWebpBlob,
  uploadProfileAvatar,
  uploadProfileAvatarBlob,
} from "@/lib/storage/avatars";
import type { ProfileData } from "@/types/profile";
import { useEffect, useRef, useState } from "react";

type EditProfileModalProps = {
  profile: ProfileData;
  onClose: () => void;
  onUpdated: (
    updates: Partial<Pick<ProfileData, "avatarUrl" | "username" | "displayName">>,
  ) => void;
};

type StagedSource = "picked" | "current";

export function EditProfileModal({
  profile,
  onClose,
  onUpdated,
}: EditProfileModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const transformAbortRef = useRef<AbortController | null>(null);

  const [pickedFile, setPickedFile] = useState<File | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(
    null,
  );
  const [generatedPreviewUrl, setGeneratedPreviewUrl] = useState<string | null>(
    null,
  );
  const [generatedBase64, setGeneratedBase64] = useState<string | null>(null);
  const [stagedSource, setStagedSource] = useState<StagedSource | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);

  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [username, setUsername] = useState(profile.username);
  const [transforming, setTransforming] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [uploadingOriginal, setUploadingOriginal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy =
    transforming || adopting || uploadingOriginal || saving;

  const displayAvatar =
    (showGenerated && generatedPreviewUrl) ||
    originalPreviewUrl ||
    profile.avatarUrl;

  const canTransformPicked = Boolean(pickedFile);
  const canTransformCurrent = Boolean(profile.avatarUrl) && !pickedFile;
  const canTransform = canTransformPicked || canTransformCurrent;
  const hasGenerated = Boolean(generatedBase64 && generatedPreviewUrl);

  useEffect(() => {
    return () => {
      transformAbortRef.current?.abort();
      if (originalPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(originalPreviewUrl);
      }
      if (generatedPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(generatedPreviewUrl);
      }
    };
    // Intentionally only on unmount; URLs are revoked when replaced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearGenerated = () => {
    if (generatedPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(generatedPreviewUrl);
    }
    setGeneratedPreviewUrl(null);
    setGeneratedBase64(null);
    setShowGenerated(false);
  };

  const clearPicked = () => {
    if (originalPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(originalPreviewUrl);
    }
    setOriginalPreviewUrl(null);
    setPickedFile(null);
    setStagedSource(null);
    clearGenerated();
  };

  const handlePick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    clearGenerated();
    if (originalPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(originalPreviewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setPickedFile(file);
    setOriginalPreviewUrl(objectUrl);
    setStagedSource("picked");
    setShowGenerated(false);
  };

  const handleTransform = async () => {
    if (!canTransform || busy) return;

    setError(null);
    setTransforming(true);
    transformAbortRef.current?.abort();
    const controller = new AbortController();
    transformAbortRef.current = controller;

    try {
      const result = await requestIdPhotoTransform({
        file: pickedFile,
        useCurrentAvatar: !pickedFile,
        signal: controller.signal,
      });

      if (generatedPreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(generatedPreviewUrl);
      }

      const url = base64ToObjectUrl(result.imageBase64, result.mimeType);
      setGeneratedBase64(result.imageBase64);
      setGeneratedPreviewUrl(url);
      setShowGenerated(true);
      if (!pickedFile) {
        setStagedSource("current");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(
        err instanceof ProfilePhotoClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : "証明写真風への変換に失敗しました",
      );
    } finally {
      setTransforming(false);
    }
  };

  const handleUseGenerated = async () => {
    if (!generatedBase64 || busy) return;

    setError(null);
    setAdopting(true);
    try {
      const blob = await convertPngBase64ToWebpBlob(generatedBase64);
      const avatarUrl = await uploadProfileAvatarBlob(blob, {
        contentType: blob.type || "image/webp",
        extension: blob.type.includes("webp") ? "webp" : "png",
      });
      onUpdated({ avatarUrl });
      clearPicked();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setAdopting(false);
    }
  };

  const handleUseOriginal = async () => {
    if (!pickedFile || busy) return;

    setError(null);
    setUploadingOriginal(true);
    try {
      const avatarUrl = await uploadProfileAvatar(pickedFile);
      onUpdated({ avatarUrl });
      clearPicked();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "アップロードに失敗しました",
      );
    } finally {
      setUploadingOriginal(false);
    }
  };

  const handleRevertGenerated = () => {
    setShowGenerated(false);
    setError(null);
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
          表示名・ユーザー名・プロフィール画像を変更できます。証明写真風への変換は保存前に確認できます。
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
          {transforming && (
            <p className="mt-3 text-center text-xs text-muted">
              証明写真風に変換中…（20〜120秒かかることがあります）
            </p>
          )}
          {hasGenerated && (
            <p className="mt-2 text-center text-[11px] text-muted">
              {showGenerated
                ? "変換後を表示中。採用するまでプロフィールは変わりません。"
                : "元の画像を表示中。"}
              {stagedSource === "current" ? "（現在の画像から変換）" : null}
            </p>
          )}
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
          onChange={handleFileChange}
        />

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2">
          {hasGenerated ? (
            <>
              <button
                type="button"
                onClick={() => void handleUseGenerated()}
                disabled={busy}
                className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {adopting ? "保存中…" : "この画像を使う"}
              </button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleRevertGenerated}
                  disabled={busy || !showGenerated}
                  className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
                >
                  元の画像を表示
                </button>
                <button
                  type="button"
                  onClick={() => void handleTransform()}
                  disabled={busy}
                  className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
                >
                  {transforming ? "変換中…" : "もう一度変換"}
                </button>
              </div>
              {pickedFile && (
                <button
                  type="button"
                  onClick={() => void handleUseOriginal()}
                  disabled={busy}
                  className="w-full rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
                >
                  {uploadingOriginal
                    ? "アップロード中…"
                    : "変換せず元の写真を使う"}
                </button>
              )}
            </>
          ) : (
            <>
              {pickedFile && (
                <button
                  type="button"
                  onClick={() => void handleUseOriginal()}
                  disabled={busy}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {uploadingOriginal
                    ? "アップロード中…"
                    : "この写真をプロフィールに使う"}
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleTransform()}
                disabled={busy || !canTransform}
                className="w-full rounded-xl border border-sky-400/40 bg-sky-500/10 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/20 disabled:opacity-50"
              >
                {transforming
                  ? "変換中…"
                  : canTransformPicked
                    ? "証明写真風にする"
                    : canTransformCurrent
                      ? "現在の画像を証明写真風にする"
                      : "証明写真風にする（画像が必要）"}
              </button>
            </>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void handleSaveProfile()}
              disabled={busy}
              className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
            >
              {saving ? "保存中…" : "表示名を保存"}
            </button>
            <button
              type="button"
              onClick={handlePick}
              disabled={busy}
              className="flex-1 rounded-xl border border-border bg-surface py-3 text-sm font-semibold text-foreground transition hover:bg-black/30 disabled:opacity-50"
            >
              写真を選択
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
    </div>
  );
}
