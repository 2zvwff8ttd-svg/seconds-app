"use client";

import { fetchComments, postComment, subscribeCommentUpdates } from "@/lib/videos/comments";
import { fetchLikeState, subscribeLikeUpdates, toggleLike } from "@/lib/videos/likes";
import type { CommentItem, LikeState } from "@/types/social";
import { useCallback, useEffect, useState } from "react";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

type VideoSocialPanelProps = {
  videoId: string;
};

export function VideoSocialPanel({ videoId }: VideoSocialPanelProps) {
  const [likeState, setLikeState] = useState<LikeState>({ count: 0, likedByMe: false });
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [draft, setDraft] = useState("");
  const [likeLoading, setLikeLoading] = useState(false);
  const [commentLoading, setCommentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [likes, list] = await Promise.all([
      fetchLikeState(videoId),
      fetchComments(videoId),
    ]);
    setLikeState(likes);
    setComments(list);
  }, [videoId]);

  useEffect(() => {
    setError(null);
    load().catch((err) => {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    });
  }, [load]);

  useEffect(() => {
    const likeChannel = subscribeLikeUpdates(videoId, setLikeState);
    const commentChannel = subscribeCommentUpdates(videoId, setComments);
    return () => {
      likeChannel.unsubscribe();
      commentChannel.unsubscribe();
    };
  }, [videoId]);

  const handleLike = async () => {
    if (likeLoading) return;
    const wasLiked = likeState.likedByMe;
    const previous = likeState;
    setLikeLoading(true);
    setError(null);
    setLikeState({
      likedByMe: !wasLiked,
      count: wasLiked ? Math.max(0, previous.count - 1) : previous.count + 1,
    });
    try {
      const next = await toggleLike(videoId, wasLiked);
      setLikeState(next);
    } catch (err) {
      setLikeState(previous);
      setError(err instanceof Error ? err.message : "いいねに失敗しました");
    } finally {
      setLikeLoading(false);
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (commentLoading || !draft.trim()) return;
    setCommentLoading(true);
    setError(null);
    try {
      const created = await postComment(videoId, draft);
      setComments((prev) => [...prev, created]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "コメントの投稿に失敗しました");
    } finally {
      setCommentLoading(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-4 border-b border-border pb-3">
        <button
          type="button"
          onClick={handleLike}
          disabled={likeLoading}
          className={`flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition touch-manipulation disabled:opacity-50 ${
            likeState.likedByMe
              ? "bg-red-500/20 text-red-400"
              : "bg-surface text-foreground hover:bg-white/10"
          }`}
          aria-pressed={likeState.likedByMe}
          aria-label={likeState.likedByMe ? "いいねを取り消す" : "いいねする"}
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-6 w-6 transition ${likeState.likedByMe ? "scale-110 fill-current" : "fill-none"}`}
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 21s-6.5-4.35-9-7.35C1.5 11.5 2 7.5 5.5 5.5 8 4 10.5 5 12 7c1.5-2 4-3 6.5-1.5 3.5 2 4 6 2.5 9 3.15 2.65 5 9 9z" />
          </svg>
          <span>{likeState.count}</span>
        </button>
        <span className="text-xs text-muted">
          {comments.length > 0 ? `${comments.length}件のコメント` : "コメントはまだありません"}
        </span>
      </div>

      {error && (
        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <ul className="mt-3 max-h-36 flex-1 space-y-3 overflow-y-auto overscroll-contain">
        {comments.map((comment) => (
          <li key={comment.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-foreground">@{comment.username}</span>
              <time className="text-[10px] text-muted" dateTime={comment.createdAt}>
                {formatRelativeTime(comment.createdAt)}
              </time>
            </div>
            <p className="mt-0.5 leading-relaxed text-foreground/90">{comment.content}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={handleSubmitComment} className="mt-3 flex gap-2 border-t border-border pt-3">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          placeholder="コメントを追加…"
          disabled={commentLoading}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted/60 focus:border-accent/50 focus:ring-1 focus:ring-accent/30 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={commentLoading || !draft.trim()}
          className="shrink-0 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          送信
        </button>
      </form>
    </div>
  );
}
