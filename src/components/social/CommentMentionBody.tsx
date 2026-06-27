"use client";

import { parseCommentContent } from "@/lib/social/parse-comment-content";
import { hasCustomDisplayName } from "@/lib/profile/display-name";
import type { MentionProfile } from "@/lib/profile/resolve-usernames";
import Link from "next/link";

type CommentMentionBodyProps = {
  content: string;
  profileMap: Map<string, MentionProfile>;
  tone?: "default" | "light";
  className?: string;
};

export function CommentMentionBody({
  content,
  profileMap,
  tone = "default",
  className = "",
}: CommentMentionBodyProps) {
  const segments = parseCommentContent(content, profileMap);
  const linkTone =
    tone === "light"
      ? "font-medium text-violet-200 hover:text-violet-100"
      : "font-medium text-violet-400 hover:text-violet-300";

  return (
    <p className={className}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.value}</span>;
        }

        const { profile } = segment;
        const label = hasCustomDisplayName(profile.displayName)
          ? profile.displayName!.trim()
          : `@${profile.username}`;

        return (
          <Link
            key={index}
            href={`/profile/${profile.userId}`}
            className={`${linkTone} transition`}
          >
            {label}
          </Link>
        );
      })}
    </p>
  );
}
