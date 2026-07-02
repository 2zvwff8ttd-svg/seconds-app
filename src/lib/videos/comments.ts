import { createClient } from "@/lib/supabase/client";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { filterCommentsByBlocked } from "@/lib/blocks/filter";
import type { CommentItem } from "@/types/social";

function mapComment(row: Record<string, unknown>): CommentItem {
  const profiles = row.profiles;
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as {
          username: string;
          display_name?: string | null;
          avatar_url?: string | null;
        })
      : profiles && typeof profiles === "object" && "username" in profiles
        ? (profiles as {
            username: string;
            display_name?: string | null;
            avatar_url?: string | null;
          })
        : null;

  return {
    id: row.id as string,
    content: row.content as string,
    createdAt: row.created_at as string,
    userId: row.user_id as string,
    username: profile?.username ?? "unknown",
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

export async function fetchComments(videoId: string): Promise<CommentItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, content, created_at, user_id, profiles!user_id(username, display_name, avatar_url)",
    )
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  const blockedIds = await fetchBlockedUserIds();
  const comments = (data ?? []).map((row) =>
    mapComment(row as unknown as Record<string, unknown>),
  );
  return filterCommentsByBlocked(comments, blockedIds);
}

export async function postComment(
  videoId: string,
  content: string,
): Promise<CommentItem> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("コメントを入力してください");
  }

  const { data, error } = await supabase
    .from("comments")
    .insert({
      video_id: videoId,
      user_id: user.id,
      content: trimmed,
    })
    .select(
      "id, content, created_at, user_id, profiles!user_id(username, display_name, avatar_url)",
    )
    .single();

  if (error) throw new Error(error.message);
  return mapComment(data as unknown as Record<string, unknown>);
}

export function subscribeCommentUpdates(
  videoId: string,
  onUpdate: (comments: CommentItem[]) => void,
): () => void {
  const supabase = createClient();

  const refresh = () => {
    fetchComments(videoId).then(onUpdate).catch(() => {});
  };

  const channel = supabase
    .channel(`comments:${videoId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments",
        filter: `video_id=eq.${videoId}`,
      },
      refresh,
    )
    .subscribe();

  // removeChannel (not just unsubscribe) so the channel is dropped from the
  // client's internal list — otherwise channels pile up on every fullscreen
  // open and never get GC'd (memory creep on iPhone 13).
  return () => {
    void supabase.removeChannel(channel);
  };
}
