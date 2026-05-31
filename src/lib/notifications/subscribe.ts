import { fetchUnreadNotificationCount } from "@/lib/notifications/list";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function subscribeNotificationUpdates(
  userId: string,
  onUpdate: () => void,
): RealtimeChannel {
  const supabase = createClient();

  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      onUpdate,
    )
    .subscribe();

  return channel;
}

export function subscribeUnreadNotificationCount(
  userId: string,
  onCount: (count: number) => void,
): RealtimeChannel {
  const refresh = () => {
    fetchUnreadNotificationCount().then(onCount).catch(() => onCount(0));
  };

  return subscribeNotificationUpdates(userId, refresh);
}
