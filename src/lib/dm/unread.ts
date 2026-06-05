import { fetchDmThreadsForUser } from "@/lib/dm/threads";

export async function fetchDmUnreadCount(): Promise<number> {
  const { inbox, requests } = await fetchDmThreadsForUser();
  return [...inbox, ...requests].reduce(
    (sum, thread) => sum + thread.unreadCount,
    0,
  );
}
