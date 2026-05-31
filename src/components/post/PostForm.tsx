"use client";

import { CameraRecorder } from "@/components/record/CameraRecorder";
import { ClipStrip } from "@/components/record/ClipStrip";
import { UploadProgress } from "@/components/post/UploadProgress";
import { postVideo } from "@/lib/videos/post";
import type { RecordedClip } from "@/types/recording";
import type { PostUploadStage, VideoVisibility } from "@/types/video";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const VISIBILITY_OPTIONS = [
  {
    value: "public" as const,
    label: "全体公開",
    description: "公開後、すべてのユーザーが視聴できます",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20" />
      </svg>
    ),
  },
  {
    value: "followers_only" as const,
    label: "フォロワーのみ",
    description: "公開後、フォロワーだけが視聴できます",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 11c1.66 0 3-1.34 3-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zM8 11c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zM8 13c-2.67 0-8 1.34-8 4v2h10M16 13c-.29 0-.62.02-.97.05 2.53.39 4.97 1.58 4.97 3.95V19H24v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    ),
  },
];

function formatPublishTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PostForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [clips, setClips] = useState<RecordedClip[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState<VideoVisibility>("public");
  const [stage, setStage] = useState<PostUploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ publishAt: string } | null>(null);

  const isUploading = stage !== "idle" && stage !== "error" && stage !== "done";
  const hasContent = clips.length > 0 || uploadFile !== null;

  useEffect(() => {
    if (!uploadFile) {
      setUploadPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(uploadFile);
    setUploadPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadFile]);

  const handleClipAdded = useCallback((clip: RecordedClip) => {
    setUploadFile(null);
    setClips((prev) => [...prev, clip]);
    setError(null);
  }, []);

  const handleRemoveClip = useCallback((id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const handleFileChange = (nextFile: File | null) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("video/")) {
      setError("動画ファイルを選択してください");
      return;
    }
    clips.forEach((c) => URL.revokeObjectURL(c.previewUrl));
    setClips([]);
    setUploadFile(nextFile);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasContent || isUploading) return;

    setError(null);
    setProgress(0);
    setProgressLabel("準備中…");

    try {
      const result = await postVideo({
        clips: clips.length > 0 ? clips.map((c) => c.file) : undefined,
        file: uploadFile ?? undefined,
        title,
        visibility,
        onStageChange: setStage,
        onProgress: (percent, label) => {
          setProgress(percent);
          setProgressLabel(label);
        },
      });

      setSuccess({ publishAt: result.publishAt });
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "投稿に失敗しました");
    }
  };

  if (success) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/15 text-violet-300">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <h2 className="text-lg font-semibold text-foreground">投稿を受け付けました</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          明日の7時に公開されます。
          <br />
          <span className="text-foreground/80">
            （{formatPublishTime(success.publishAt)}）
          </span>
        </p>
        <p className="mt-2 text-xs text-muted">
          公開されるまで他のユーザーには表示されません。
        </p>
        <Link
          href="/"
          className="mt-8 w-full max-w-xs rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-500/25"
        >
          ホームに戻る
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 sm:px-5">
        {!uploadFile ? (
          <>
            <CameraRecorder
              clips={clips}
              onClipAdded={handleClipAdded}
              disabled={isUploading}
            />
            <ClipStrip
              clips={clips}
              onRemove={handleRemoveClip}
              disabled={isUploading}
            />
          </>
        ) : (
          <div className="space-y-3 pb-4">
            <div className="overflow-hidden rounded-2xl border border-border bg-black">
              {uploadPreviewUrl && (
                <video
                  src={uploadPreviewUrl}
                  controls
                  playsInline
                  className="aspect-[9/16] max-h-[38vh] w-full bg-black object-contain"
                />
              )}
            </div>
            <button
              type="button"
              onClick={() => setUploadFile(null)}
              disabled={isUploading}
              className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline"
            >
              カメラ撮影に戻る
            </button>
          </div>
        )}

        {!uploadFile && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="mt-3 w-full text-center text-xs text-muted underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
          >
            ファイルから選ぶ
          </button>
        )}

        {hasContent && (
          <div className="mt-4">
            <label htmlFor="title" className="mb-1.5 flex items-baseline gap-2">
              <span className="text-xs font-medium text-foreground">タイトル</span>
              <span className="text-[10px] text-muted">任意</span>
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              disabled={isUploading}
              placeholder="未入力の場合は「無題のvlog」になります"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/50 focus:border-accent/50 focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
            />
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface-elevated/95 px-4 py-4 backdrop-blur-lg sm:px-5">
        {hasContent && (
          <section aria-labelledby="visibility-label">
            <h2 id="visibility-label" className="mb-1 text-xs font-semibold text-foreground">
              公開範囲
            </h2>
            <p className="mb-3 text-[10px] text-muted">公開後に誰が視聴できるかを選びます</p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {VISIBILITY_OPTIONS.map((option) => {
                const selected = visibility === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isUploading}
                    onClick={() => setVisibility(option.value)}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition disabled:opacity-50 ${
                      selected
                        ? "border-violet-400/70 bg-violet-500/15 ring-1 ring-violet-400/30"
                        : "border-border bg-surface hover:border-border/80"
                    }`}
                  >
                    <span className={selected ? "text-violet-300" : "text-muted"}>
                      {option.icon}
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      <span className="mt-0.5 block text-[10px] leading-snug text-muted">
                        {option.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {isUploading && (
          <div className="mt-4">
            <UploadProgress percent={progress} label={progressLabel} />
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!hasContent || isUploading}
          className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isUploading
            ? "投稿中…"
            : clips.length > 1
              ? `${clips.length}クリップをvlogとして投稿`
              : "投稿する"}
        </button>

        {!hasContent && !isUploading && (
          <p className="mt-2 text-center text-[10px] text-muted">
            録画ボタンでクリップを撮影してください
          </p>
        )}
      </div>
    </form>
  );
}
