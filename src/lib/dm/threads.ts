import { createClient } from "@/lib/supabase/client";
import { fetchBlockedUserIds } from "@/lib/blocks/list";
import { filterDmThreadsByBlocked } from "@/lib/blocks/filter";
import type { DmThreadStatus, DmThreadSummary } from "@/types/dm";

type ThreadRow = {
  id: string;
  participant_low: string;
  participant_high: string;
  initiated_by: string;
  status: DmThreadStatus;
  last_message_at: string | null;
  last_message_preview: string | null;
};

function otherParticipantId(
  row: Pick<ThreadRow, "participant_low" | "participant_high">,
  userId: string,
): string {
  return row.participant_low === userId
    ? row.participant_high
    : row.participant_low;
}

async function fetchProfilesMap(userIds: string[]) {
  const supabase = createClient();
  if (userIds.length === 0) {
    return new Map<
      string,
      { username: string; display_name: string | null; avatar_url: string | null }
    >();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", userIds);

  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      {
        username: p.username as string,
        display_name: (p.display_name as string | null) ?? null,
        avatar_url: (p.avatar_url as string | null) ?? null,
      },
    ]),
  );
}

async function fetchUnreadCountsMap(): Promise<Map<string, number>> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("dm_thread_unread_counts");

  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((row: { thread_id: string; unread_count: number }) => [
      row.thread_id,
      row.unread_count ?? 0,
    ]),
  );
}

export async function fetchDmThreadsForUser(): Promise<{
  inbox: DmThreadSummary[];
  requests: DmThreadSummary[];
}> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const { data: rows, error } = await supabase
    .from("dm_threads")
    .select(
      "id, participant_low, participant_high, initiated_by, status, last_message_at, last_message_preview",
    )
    .or(`participant_low.eq.${user.id},participant_high.eq.${user.id}`)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  const threads = (rows ?? []) as ThreadRow[];
  const otherIds = threads.map((t) => otherParticipantId(t, user.id));

  const [profileMap, unreadMap, blockedIds] = await Promise.all([
    fetchProfilesMap(otherIds),
    fetchUnreadCountsMap(),
    fetchBlockedUserIds(),
  ]);

  const summaries: DmThreadSummary[] = threads.map((row) => {
    const otherId = otherParticipantId(row, user.id);
    const profile = profileMap.get(otherId);
    const isInitiator = row.initiated_by === user.id;
    const isRequest = row.status === "pending" && !isInitiator;

    return {
      id: row.id,
      status: row.status,
      isInitiator,
      isRequest,
      otherUserId: otherId,
      otherUsername: profile?.username ?? "unknown",
      otherDisplayName: profile?.display_name ?? null,
      otherAvatarUrl: profile?.avatar_url ?? null,
      lastMessagePreview: row.last_message_preview,
      lastMessageAt: row.last_message_at,
      unreadCount: unreadMap.get(row.id) ?? 0,
    };
  });

  return {
    inbox: filterDmThreadsByBlocked(
      summaries.filter(
        (t) =>
          t.status === "active" ||
          (t.status === "pending" && t.isInitiator),
      ),
      blockedIds,
    ),
    requests: filterDmThreadsByBlocked(
      summaries.filter((t) => t.isRequest),
      blockedIds,
    ),
  };
}

export async function acceptDmRequest(threadId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("accept_dm_request", {
    p_thread_id: threadId,
  });
  if (error) throw new Error(error.message);
}

export async function declineDmRequest(threadId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("decline_dm_request", {
    p_thread_id: threadId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchDmThreadMeta(threadId: string): Promise<{
  id: string;
  status: DmThreadStatus;
  isInitiator: boolean;
  isRequest: boolean;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string | null;
  otherAvatarUrl: string | null;
} | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const { data: row, error } = await supabase
    .from("dm_threads")
    .select(
      "id, participant_low, participant_high, initiated_by, status",
    )
    .eq("id", threadId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!row) return null;

  const thread = row as Pick<
    ThreadRow,
    "id" | "participant_low" | "participant_high" | "initiated_by" | "status"
  >;
  const otherId = otherParticipantId(thread, user.id);
  const profileMap = await fetchProfilesMap([otherId]);
  const profile = profileMap.get(otherId);
  const isInitiator = thread.initiated_by === user.id;

  return {
    id: thread.id,
    status: thread.status,
    isInitiator,
    isRequest: thread.status === "pending" && !isInitiator,
    otherUserId: otherId,
    otherUsername: profile?.username ?? "unknown",
    otherDisplayName: profile?.display_name ?? null,
    otherAvatarUrl: profile?.avatar_url ?? null,
  };
}

export async function findDmThreadWithUser(
  otherUserId: string,
): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const low = user.id < otherUserId ? user.id : otherUserId;
  const high = user.id < otherUserId ? otherUserId : user.id;

  const { data, error } = await supabase
    .from("dm_threads")
    .select("id")
    .eq("participant_low", low)
    .eq("participant_high", high)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.id ?? null;
}
