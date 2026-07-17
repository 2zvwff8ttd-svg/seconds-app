"use client";

import { resumePendingSaveComposes } from "@/lib/video/save-compose-worker";
import { useEffect } from "react";

/**
 * Resumes background circle-save compose for the signed-in user's videos
 * that still lack save_video_url (post-success queue + app reopen).
 */
export function SaveComposeEffect() {
  useEffect(() => {
    let cancelled = false;

    const run = () => {
      if (cancelled) return;
      void resumePendingSaveComposes();
    };

    run();

    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };

    window.addEventListener("focus", run);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
