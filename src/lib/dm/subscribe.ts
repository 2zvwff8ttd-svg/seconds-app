import { fetchDmUnreadCount } from "@/lib/dm/unread";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function subscribeDmUpdates(
  userId: string,
  onUpdate: () => void,
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase
    .channel(`dm:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dm_messages" },
      onUpdate,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "dm_threads" },
      onUpdate,
    )
    .subscribe();

  return channel;
}

export function subscribeDmUnreadCount(
  userId: string,
  onCount: (count: number) => void,
): RealtimeChannel {
  const refresh = () => {
    fetchDmUnreadCount().then(onCount).catch(() => onCount(0));
  };

  return subscribeDmUpdates(userId, refresh);
}
