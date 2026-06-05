import { createClient } from "@/lib/supabase/client";
import type { CommentItem } from "@/types/social";
import type { RealtimeChannel } from "@supabase/supabase-js";

function mapComment(row: Record<string, unknown>): CommentItem {
  const profiles = row.profiles;
  const profile =
    Array.isArray(profiles) && profiles.length > 0
      ? (profiles[0] as { username: string })
      : profiles && typeof profiles === "object" && "username" in profiles
        ? (profiles as { username: string })
        : null;

  return {
    id: row.id as string,
    content: row.content as string,
    createdAt: row.created_at as string,
    userId: row.user_id as string,
    username: profile?.username ?? "unknown",
  };
}

export async function fetchComments(videoId: string): Promise<CommentItem[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at, user_id, profiles!user_id(username)")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    mapComment(row as unknown as Record<string, unknown>),
  );
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
    .select("id, content, created_at, user_id, profiles!user_id(username)")
    .single();

  if (error) throw new Error(error.message);
  return mapComment(data as unknown as Record<string, unknown>);
}

export function subscribeCommentUpdates(
  videoId: string,
  onUpdate: (comments: CommentItem[]) => void,
): RealtimeChannel {
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

  return channel;
}
