import { createClient } from "@/lib/supabase/client";
import type { AppNotification, NotificationType } from "@/types/notification";

const NOTIFICATION_SELECT = `
  id,
  type,
  title,
  body,
  read,
  created_at,
  actor_id,
  video_id,
  comment_id,
  actor:profiles!actor_id (username, display_name)
`;

function mapNotification(row: Record<string, unknown>): AppNotification {
  const actor = row.actor;
  const actorProfile =
    Array.isArray(actor) && actor.length > 0
      ? (actor[0] as { username: string; display_name?: string | null })
      : actor && typeof actor === "object" && "username" in actor
        ? (actor as { username: string; display_name?: string | null })
        : null;

  return {
    id: row.id as string,
    type: row.type as NotificationType,
    title: row.title as string,
    body: row.body as string,
    read: Boolean(row.read),
    createdAt: row.created_at as string,
    actorId: (row.actor_id as string | null) ?? null,
    actorUsername: actorProfile?.username ?? null,
    actorDisplayName: actorProfile?.display_name ?? null,
    videoId: (row.video_id as string | null) ?? null,
    commentId: (row.comment_id as string | null) ?? null,
  };
}

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    if (
      error.message.includes("actor_id") ||
      error.message.includes("schema cache") ||
      error.message.includes("does not exist")
    ) {
      const fallback = await supabase
        .from("notifications")
        .select("id, type, title, body, read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (fallback.error) throw new Error(fallback.error.message);
      return (fallback.data ?? []).map((row) =>
        mapNotification({
          ...(row as Record<string, unknown>),
          actor_id: null,
          video_id: null,
          comment_id: null,
          actor: null,
        }),
      );
    }
    throw new Error(error.message);
  }

  return (data ?? []).map((row) =>
    mapNotification(row as unknown as Record<string, unknown>),
  );
}

export async function fetchUnreadNotificationCount(): Promise<number> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return 0;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) return 0;
  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return;

  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", user.id)
    .eq("read", false);

  if (error) throw new Error(error.message);
}
