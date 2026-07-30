import { createClient } from "@/lib/supabase/client";

/**
 * Total unread DM count for the badge.
 * Uses existing `dm_thread_unread_counts` RPC (sum) — does not load thread lists/profiles.
 */
export async function fetchDmUnreadCount(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("dm_thread_unread_counts");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { unread_count?: number }[];
  return rows.reduce((sum, row) => sum + (Number(row.unread_count) || 0), 0);
}
