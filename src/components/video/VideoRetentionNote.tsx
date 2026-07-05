"use client";

import {
  computeVideoRetentionExpiry,
  fetchVideoRetentionConfig,
  formatVideoRetentionNote,
} from "@/lib/videos/retention";
import { useEffect, useState } from "react";

type VideoRetentionNoteProps = {
  publishedAt?: string | null;
  publishAt?: string | null;
  className?: string;
};

export function VideoRetentionNote({
  publishedAt,
  publishAt,
  className = "",
}: VideoRetentionNoteProps) {
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchVideoRetentionConfig().then((config) => {
      if (cancelled) return;
      const expiresAt = computeVideoRetentionExpiry(config, {
        publishedAt,
        publishAt,
      });
      if (!expiresAt) {
        setNote("公開から10日で消えます");
        return;
      }
      setNote(formatVideoRetentionNote(expiresAt));
    });

    return () => {
      cancelled = true;
    };
  }, [publishedAt, publishAt]);

  if (!note) return null;

  return (
    <p className={className}>{note}</p>
  );
}
