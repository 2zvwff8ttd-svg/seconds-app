"use client";

import { AiEnhancePanel } from "@/components/post/AiEnhancePanel";
import { CameraRecorder } from "@/components/record/CameraRecorder";
import { ClipStrip } from "@/components/record/ClipStrip";
import { UploadProgress } from "@/components/post/UploadProgress";
import { analyzeVideoFrame, generateAiMusic } from "@/lib/ai/client";
import { AI_BGM_GENERATION_ENABLED, PRESET_BGM_ENABLED } from "@/lib/ai/features";
import {
  fetchTodayAssignedSeconds,
} from "@/lib/recording/daily-assignment";
import {
  isRecordingBudgetExhausted,
  sumRecordedClipSeconds,
} from "@/lib/recording/clip-budget";
import { postVideo } from "@/lib/videos/post";
import { blobToBase64, extractFirstFrameBlob } from "@/lib/video/extract-frame";
import { mergeVideoWithBgm } from "@/lib/video/merge-bgm";
import type { AiAnalyzeResult, AiEnhanceStatus } from "@/types/ai";
import type { PresetBgmTrack } from "@/types/preset-bgm";
import type { RecordedClip } from "@/types/recording";
import type { PostUploadStage, VideoVisibility } from "@/types/video";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [clips, setClips] = useState<RecordedClip[]>([]);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [visibility, setVisibility] = useState<VideoVisibility>("public");
  const [stage, setStage] = useState<PostUploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ publishAt: string } | null>(null);
  const [assignedSeconds, setAssignedSeconds] = useState(15);

  const [aiMusicEnabled, setAiMusicEnabled] = useState(false);
  const [aiStatus, setAiStatus] = useState<AiEnhanceStatus>("idle");
  const [analyzeResult, setAnalyzeResult] = useState<AiAnalyzeResult | null>(null);
  const [bgmBlob, setBgmBlob] = useState<Blob | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<PresetBgmTrack | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiRunId = useRef(0);

  useEffect(() => {
    fetchTodayAssignedSeconds()
      .then(setAssignedSeconds)
      .catch(() => {});
  }, []);

  const isUploading = stage !== "idle" && stage !== "error" && stage !== "done";
  const hasContent = clips.length > 0;
  const usedSeconds = useMemo(() => sumRecordedClipSeconds(clips), [clips]);
  const budgetExhausted = useMemo(
    () => isRecordingBudgetExhausted(usedSeconds, assignedSeconds),
    [usedSeconds, assignedSeconds],
  );
  const bgmReady =
    !aiMusicEnabled ||
    (AI_BGM_GENERATION_ENABLED ? Boolean(bgmBlob) : Boolean(selectedPreset && bgmBlob));
  const canPost = hasContent && budgetExhausted && !isUploading && bgmReady;
  const showPostDetails = budgetExhausted && hasContent;
  const clipKey = useMemo(() => clips.map((c) => c.id).join(","), [clips]);

  const runMusicGeneration = useCallback(
    async (result: AiAnalyzeResult, totalSeconds: number, runId: number) => {
      if (!AI_BGM_GENERATION_ENABLED) return;
      setAiStatus("generating_music");
      try {
        const blob = await generateAiMusic(result.musicPrompt, totalSeconds);
        if (aiRunId.current !== runId) return;
        setBgmBlob(blob);
        setAiStatus("ready");
      } catch (err) {
        if (aiRunId.current !== runId) return;
        setAiError(err instanceof Error ? err.message : "BGM生成に失敗しました");
        setAiStatus("error");
      }
    },
    [],
  );

  const runAiPipeline = useCallback(async () => {
    if (clips.length === 0) return;

    const runId = ++aiRunId.current;
    setAiError(null);
    setAnalyzeResult(null);
    if (AI_BGM_GENERATION_ENABLED) {
      setBgmBlob(null);
      setSelectedPreset(null);
    }
    setAiStatus("analyzing");

    try {
      const frame = await extractFirstFrameBlob(clips[0].file);
      const base64 = await blobToBase64(frame);
      const result = await analyzeVideoFrame(base64, "image/jpeg");

      if (aiRunId.current !== runId) return;

      setAnalyzeResult(result);
      if (!titleTouched) {
        setTitle(result.title);
      }

      if (aiMusicEnabled && AI_BGM_GENERATION_ENABLED) {
        await runMusicGeneration(result, usedSeconds, runId);
      } else {
        setAiStatus("ready");
      }
    } catch (err) {
      if (aiRunId.current !== runId) return;
      setAiError(err instanceof Error ? err.message : "AI解析に失敗しました");
      setAiStatus("error");
    }
  }, [clips, aiMusicEnabled, runMusicGeneration, titleTouched, usedSeconds]);

  useEffect(() => {
    if (!budgetExhausted || clips.length === 0) {
      setAiStatus("idle");
      setAnalyzeResult(null);
      setBgmBlob(null);
      setSelectedPreset(null);
      setAiError(null);
      return;
    }
    void runAiPipeline();
  }, [budgetExhausted, clipKey, runAiPipeline]);

  useEffect(() => {
    if (!AI_BGM_GENERATION_ENABLED) return;
    if (!aiMusicEnabled || !analyzeResult || bgmBlob || aiStatus === "analyzing") {
      return;
    }
    if (aiStatus === "generating_music") return;
    const runId = aiRunId.current;
    void runMusicGeneration(analyzeResult, usedSeconds, runId);
  }, [
    aiMusicEnabled,
    analyzeResult,
    bgmBlob,
    aiStatus,
    usedSeconds,
    runMusicGeneration,
  ]);

  const handlePresetSelect = useCallback((track: PresetBgmTrack, blob: Blob) => {
    setSelectedPreset(track);
    setBgmBlob(blob);
    setAiError(null);
    if (analyzeResult) setAiStatus("ready");
  }, [analyzeResult]);

  const handleAiMusicChange = (enabled: boolean) => {
    setAiMusicEnabled(enabled);
    if (!enabled) {
      setBgmBlob(null);
      setSelectedPreset(null);
      if (analyzeResult) setAiStatus("ready");
      return;
    }
    if (!AI_BGM_GENERATION_ENABLED && analyzeResult) {
      setAiStatus("ready");
    }
  };

  const handleClipAdded = useCallback((clip: RecordedClip) => {
    setClips((prev) => [...prev, clip]);
    setError(null);
    setTitleTouched(false);
  }, []);

  const handleRemoveClip = useCallback((id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((c) => c.id !== id);
    });
    setTitleTouched(false);
  }, []);

  const prepareClipsForUpload = async (): Promise<
    { file: File; durationSeconds: number }[]
  > => {
    const shouldMergeBgm =
      aiMusicEnabled &&
      bgmBlob &&
      (AI_BGM_GENERATION_ENABLED || PRESET_BGM_ENABLED);

    if (!shouldMergeBgm) {
      return clips.map((c) => ({
        file: c.file,
        durationSeconds: c.durationSeconds,
      }));
    }

    setStage("merging_audio");
    setProgressLabel("BGM を動画に合成中…");

    const merged: { file: File; durationSeconds: number }[] = [];
    for (let i = 0; i < clips.length; i++) {
      setProgressLabel(
        clips.length > 1
          ? `クリップ ${i + 1}/${clips.length} に BGM を合成中…`
          : "BGM を動画に合成中…",
      );
      const file = await mergeVideoWithBgm(
        clips[i].file,
        bgmBlob,
        (ratio) => setProgress(Math.round(ratio * 15)),
      );
      merged.push({ file, durationSeconds: clips[i].durationSeconds });
    }
    return merged;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPost) return;

    setError(null);
    setProgress(0);
    setProgressLabel("準備中…");

    try {
      const uploadClips = await prepareClipsForUpload();

      const result = await postVideo({
        clips: uploadClips,
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
      const message = err instanceof Error ? err.message : "投稿に失敗しました";
      setError(
        message.includes("BGM") ? message : `投稿に失敗しました: ${message}`,
      );
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
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 sm:px-5">
        {!showPostDetails ? (
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
            {hasContent && !isUploading && (
              <p className="mt-4 text-center text-xs leading-relaxed text-muted">
                割り当て時間（{assignedSeconds}秒）をすべて使うと、
                <br />
                タイトル・BGM・公開範囲の設定に進みます
              </p>
            )}
          </>
        ) : (
          <>
            <div className="mb-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2.5">
              <p className="text-xs font-medium text-violet-200">撮影完了</p>
              <p className="mt-0.5 text-[10px] text-muted">
                {usedSeconds}秒のクリップ {clips.length}本 — 投稿内容を設定してください
              </p>
            </div>
            <ClipStrip
              clips={clips}
              onRemove={handleRemoveClip}
              disabled={isUploading}
            />
            <AiEnhancePanel
              status={aiStatus}
              aiMusicEnabled={aiMusicEnabled}
              onAiMusicChange={handleAiMusicChange}
              analyzeResult={analyzeResult}
              error={aiError}
              onRegenerate={() => void runAiPipeline()}
              disabled={isUploading}
              selectedPresetId={selectedPreset?.id ?? null}
              onPresetSelect={handlePresetSelect}
            />
            <div className="mt-4">
              <label htmlFor="title" className="mb-1.5 flex items-baseline gap-2">
                <span className="text-xs font-medium text-foreground">タイトル</span>
                <span className="text-[10px] text-muted">
                  {analyzeResult && !titleTouched ? "AI提案" : "任意"}
                </span>
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitleTouched(true);
                  setTitle(e.target.value);
                }}
                maxLength={120}
                disabled={isUploading}
                placeholder={
                  analyzeResult?.title || "未入力の場合は「無題のvlog」になります"
                }
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm outline-none placeholder:text-muted/50 focus:border-accent/50 focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
              />
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border bg-surface-elevated/95 px-4 py-4 backdrop-blur-lg sm:px-5">
        {showPostDetails && (
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

        {showPostDetails && (
          <button
            type="submit"
            disabled={!canPost}
            className="mt-4 w-full rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3.5 text-base font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isUploading ? "投稿中…" : "投稿"}
          </button>
        )}

        {!showPostDetails && !hasContent && !isUploading && (
          <p className="mt-2 text-center text-[10px] text-muted">
            録画ボタンでクリップを撮影してください
          </p>
        )}

        {showPostDetails && aiMusicEnabled && !bgmReady && !isUploading && (
          <p className="mt-2 text-center text-[10px] text-amber-200/90">
            BGM を ON にした場合は曲を選択してください
          </p>
        )}
      </div>
    </form>
  );
}
