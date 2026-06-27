"use client";

import { resolveMentionProfiles, type MentionProfile } from "@/lib/profile/resolve-usernames";
import { extractMentionUsernames } from "@/lib/social/mention-regex";
import type { CommentItem } from "@/types/social";
import { useEffect, useRef, useState } from "react";

/**
 * Resolves @usernames referenced in comment bodies. Caches known profiles so
 * realtime comment inserts do not re-query usernames already resolved.
 */
export function useMentionProfileMap(comments: CommentItem[]): Map<string, MentionProfile> {
  const cacheRef = useRef(new Map<string, MentionProfile>());
  const [profileMap, setProfileMap] = useState(() => new Map(cacheRef.current));

  useEffect(() => {
    const unresolved: string[] = [];

    for (const comment of comments) {
      for (const username of extractMentionUsernames(comment.content)) {
        const key = username.toLowerCase();
        if (!cacheRef.current.has(key)) {
          unresolved.push(username);
        }
      }
    }

    if (unresolved.length === 0) return;

    let cancelled = false;

    resolveMentionProfiles(unresolved)
      .then((resolved) => {
        if (cancelled) return;
        for (const [key, profile] of resolved) {
          cacheRef.current.set(key, profile);
        }
        setProfileMap(new Map(cacheRef.current));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [comments]);

  return profileMap;
}
