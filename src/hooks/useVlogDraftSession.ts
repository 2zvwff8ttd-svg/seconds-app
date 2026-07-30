"use client";

import {
  clearVlogDraft,
  getCurrentPostingDay,
  loadVlogDraft,
  purgeExpiredVlogDrafts,
  recordedClipFromStoredDraft,
  revokeRecordedClips,
  saveVlogDraft,
  VlogDraftStorageError,
} from "@/lib/draft/vlog-draft-store";
import { createClient } from "@/lib/supabase/client";
import type { VideoDisplayMaskShape } from "@/lib/video/display-mask";
import type { RecordedClip } from "@/types/recording";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

const SAVE_DEBOUNCE_MS = 350;

type UseVlogDraftSessionOptions = {
  clips: RecordedClip[];
  setClips: Dispatch<SetStateAction<RecordedClip[]>>;
  displayMaskShape: VideoDisplayMaskShape;
  setDisplayMaskShape: (shape: VideoDisplayMaskShape) => void;
  title: string;
  setTitle: (title: string) => void;
  enabled: boolean;
};

export function useVlogDraftSession({
  clips,
  setClips,
  displayMaskShape,
  setDisplayMaskShape,
  title,
  setTitle,
  enabled,
}: UseVlogDraftSessionOptions) {
  const [draftReady, setDraftReady] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);
  const sessionRef = useRef<{ userId: string; postingDay: string } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const clipsRef = useRef(clips);

  useEffect(() => {
    clipsRef.current = clips;
  }, [clips]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user || cancelled) {
          if (!cancelled) setDraftReady(true);
          return;
        }

        await purgeExpiredVlogDrafts();
        const postingDay = getCurrentPostingDay();
        const draft = await loadVlogDraft(user.id, postingDay);

        if (cancelled) return;

        sessionRef.current = { userId: user.id, postingDay };

        if (draft && draft.clips.length > 0) {
          const restored: RecordedClip[] = [];
          for (const stored of draft.clips) {
            try {
              restored.push(await recordedClipFromStoredDraft(stored));
            } catch (err) {
              console.warn("[useVlogDraftSession] skip corrupt draft clip", err);
            }
          }
          if (restored.length === 0) return;
          // Camera may already be open; never clobber clips the user just recorded.
          if (clipsRef.current.length > 0) return;
          setClips(restored);
          setDisplayMaskShape(draft.displayMaskShape);
          if (draft.title) {
            setTitle(draft.title);
          }
          setDraftRestored(true);
        }
      } catch (err) {
        console.warn("[useVlogDraftSession] load failed", err);
      } finally {
        if (!cancelled) setDraftReady(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      revokeRecordedClips(clipsRef.current);
    };
    // Mount-only: restore draft once per /post visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistDraft = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || !enabled) return;

    try {
      await saveVlogDraft({
        userId: session.userId,
        postingDay: session.postingDay,
        displayMaskShape,
        clips,
        title,
      });
      setDraftSaveError(null);
    } catch (err) {
      const message =
        err instanceof VlogDraftStorageError
          ? err.message
          : err instanceof Error
            ? err.message
            : "撮りかけの保存に失敗しました";
      setDraftSaveError(message);
    }
  }, [clips, displayMaskShape, enabled, title]);

  useEffect(() => {
    if (!draftReady || !sessionRef.current || !enabled) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      void persistDraft();
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [clips, displayMaskShape, title, draftReady, enabled, persistDraft]);

  const notifyPostSuccess = useCallback(async () => {
    const session = sessionRef.current;
    revokeRecordedClips(clipsRef.current);
    setClips([]);
    setDraftRestored(false);
    setDraftSaveError(null);

    if (!session) return;
    try {
      await clearVlogDraft(session.userId, session.postingDay);
    } catch (err) {
      console.warn("[useVlogDraftSession] clear after post failed", err);
    }
  }, [setClips]);

  const discardDraft = useCallback(async () => {
    const session = sessionRef.current;
    revokeRecordedClips(clipsRef.current);
    setClips([]);
    setDraftRestored(false);
    setDraftSaveError(null);
    setTitle("");

    if (!session) return;
    try {
      await clearVlogDraft(session.userId, session.postingDay);
    } catch (err) {
      console.warn("[useVlogDraftSession] discard failed", err);
    }
  }, [setClips, setTitle]);

  const dismissDraftSaveError = useCallback(() => {
    setDraftSaveError(null);
  }, []);

  return {
    draftReady,
    draftRestored,
    draftSaveError,
    dismissDraftSaveError,
    notifyPostSuccess,
    discardDraft,
  };
}
