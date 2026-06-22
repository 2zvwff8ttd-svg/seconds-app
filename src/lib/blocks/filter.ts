import type { FeedVideo } from "@/types/feed";
import type { CommentItem } from "@/types/social";
import type { DmThreadSummary } from "@/types/dm";

export function filterVideosByBlocked(
  videos: FeedVideo[],
  blockedIds: ReadonlySet<string>,
): FeedVideo[] {
  if (blockedIds.size === 0) return videos;
  return videos.filter((video) => !blockedIds.has(video.creatorId));
}

export function filterCommentsByBlocked(
  comments: CommentItem[],
  blockedIds: ReadonlySet<string>,
): CommentItem[] {
  if (blockedIds.size === 0) return comments;
  return comments.filter((comment) => !blockedIds.has(comment.userId));
}

export function filterDmThreadsByBlocked(
  threads: DmThreadSummary[],
  blockedIds: ReadonlySet<string>,
): DmThreadSummary[] {
  if (blockedIds.size === 0) return threads;
  return threads.filter((thread) => !blockedIds.has(thread.otherUserId));
}
