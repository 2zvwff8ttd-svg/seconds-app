"use client";

import { bonusDayMessageFromStreak, fetchCurrentStreak } from "@/lib/posting/post-streak";
import { DAILY_POST_LIMIT_MESSAGE } from "@/lib/posting/daily-post-limit";
import { invalidateHomeCaches } from "@/lib/home/feed-cache";
import { maybeRequestInAppReviewAfterPostSuccess } from "@/lib/review/in-app-review";
import { postVideo, type PostClipInput } from "@/lib/videos/post";
import { enqueueSaveCompose } from "@/lib/video/save-compose-worker";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";
import type { PostUploadStage, VideoVisibility } from "@/types/video";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type UploadSuccessState = {
  publishAt: string;
  bonusCountdownMessage: string;
};

export type StartUploadInput = {
  clips: PostClipInput[];
  thumbnailSource?: File;
  precomputedClipThumbnails?: Array<Blob | undefined>;
  /** ホームバブル用（任意クリップの選択フレーム） */
  bubbleThumbnailBlob?: Blob;
  bgmUrl?: string;
  /** ナレーション音声（ffmpeg で動画に焼き込み） */
  narrationBlob?: Blob;
  title: string;
  visibility: VideoVisibility;
  displayMaskShape?: VideoDisplayMaskShape;
  onSuccess?: () => void | Promise<void>;
};

type UploadContextValue = {
  isUploading: boolean;
  stage: PostUploadStage;
  progress: number;
  progressLabel: string;
  success: UploadSuccessState | null;
  error: string | null;
  submitBonusMessage: string | null;
  startUpload: (input: StartUploadInput) => void;
  dismissSuccess: () => void;
  dismissError: () => void;
};

const UploadContext = createContext<UploadContextValue | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  const [stage, setStage] = useState<PostUploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [success, setSuccess] = useState<UploadSuccessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitBonusMessage, setSubmitBonusMessage] = useState<string | null>(
    null,
  );
  const runningRef = useRef(false);

  const isUploading =
    stage !== "idle" && stage !== "error" && stage !== "done";

  const runUpload = useCallback(async (input: StartUploadInput) => {
    if (runningRef.current) return;
    runningRef.current = true;

    setSuccess(null);
    setError(null);
    setSubmitBonusMessage(null);
    setProgress(0);
    setProgressLabel("準備中…");
    setStage("preparing");

    try {
      const result = await postVideo({
        clips: input.clips,
        thumbnailSource: input.thumbnailSource,
        precomputedClipThumbnails: input.precomputedClipThumbnails,
        bubbleThumbnailBlob: input.bubbleThumbnailBlob,
        bgmUrl: input.bgmUrl,
        narrationBlob: input.narrationBlob,
        title: input.title,
        visibility: input.visibility,
        displayMaskShape: input.displayMaskShape,
        onStageChange: setStage,
        onProgress: (percent, label) => {
          setProgress(percent);
          setProgressLabel(label);
        },
      });

      if (input.onSuccess) {
        await input.onSuccess();
      }

      // Background: circle+starfield save MP4 (does not block post success UI).
      enqueueSaveCompose({
        videoId: result.videoId,
        videoUrl: result.videoUrl,
      });

      setSuccess({
        publishAt: result.publishAt,
        bonusCountdownMessage: bonusDayMessageFromStreak(result.currentStreak),
      });
      // Fresh content on home after posting — don't serve the pre-post snapshot.
      invalidateHomeCaches();
      setStage("done");
      setProgress(100);
      setProgressLabel("投稿を受け付けました");

      // Native only: 3rd lifetime post → Apple/Google in-app review (once).
      void maybeRequestInAppReviewAfterPostSuccess();
    } catch (err) {
      setStage("error");
      setProgressLabel("");
      const message =
        err instanceof Error && err.message.trim()
          ? err.message.trim()
          : "投稿に失敗しました";
      setError(message);

      if (message === DAILY_POST_LIMIT_MESSAGE) {
        void fetchCurrentStreak()
          .then((streak) =>
            setSubmitBonusMessage(bonusDayMessageFromStreak(streak)),
          )
          .catch(() => setSubmitBonusMessage(null));
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  const startUpload = useCallback(
    (input: StartUploadInput) => {
      void runUpload(input);
    },
    [runUpload],
  );

  const dismissSuccess = useCallback(() => {
    setSuccess(null);
    setStage("idle");
    setProgress(0);
    setProgressLabel("");
  }, []);

  const dismissError = useCallback(() => {
    setError(null);
    setSubmitBonusMessage(null);
    setStage("idle");
    setProgress(0);
    setProgressLabel("");
  }, []);

  useEffect(() => {
    if (!isUploading) return;

    const leavingMessage =
      "投稿中です。ページを離れるとアップロードが中断される場合があります。";

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = leavingMessage;
      return leavingMessage;
    };

    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      event.preventDefault();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [isUploading]);

  const value = useMemo<UploadContextValue>(
    () => ({
      isUploading,
      stage,
      progress,
      progressLabel,
      success,
      error,
      submitBonusMessage,
      startUpload,
      dismissSuccess,
      dismissError,
    }),
    [
      dismissError,
      dismissSuccess,
      error,
      isUploading,
      progress,
      progressLabel,
      stage,
      startUpload,
      submitBonusMessage,
      success,
    ],
  );

  return (
    <UploadContext.Provider value={value}>{children}</UploadContext.Provider>
  );
}

export function useUpload(): UploadContextValue {
  const context = useContext(UploadContext);
  if (!context) {
    throw new Error("useUpload must be used within UploadProvider");
  }
  return context;
}
