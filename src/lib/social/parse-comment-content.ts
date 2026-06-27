import { MENTION_USERNAME_CAPTURE } from "@/lib/social/mention-regex";
import type { MentionProfile } from "@/lib/profile/resolve-usernames";

export type CommentContentSegment =
  | { type: "text"; value: string }
  | { type: "mention"; username: string; profile: MentionProfile };

export function parseCommentContent(
  content: string,
  profileMap: Map<string, MentionProfile>,
): CommentContentSegment[] {
  if (!content) return [];

  const segments: CommentContentSegment[] = [];
  const re = new RegExp(MENTION_USERNAME_CAPTURE.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(content)) !== null) {
    const matchStart = match.index;
    const fullMatch = match[0];
    const username = match[1];
    const profile = profileMap.get(username.toLowerCase());

    if (matchStart > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, matchStart) });
    }

    if (profile) {
      segments.push({ type: "mention", username, profile });
    } else {
      segments.push({ type: "text", value: fullMatch });
    }

    lastIndex = matchStart + fullMatch.length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  return segments;
}
