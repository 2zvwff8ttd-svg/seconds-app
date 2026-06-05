import { createClient } from "@/lib/supabase/client";
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
  if (userIds.length === 0) return new Map<string, { username: string; avatar_url: string | null }>();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, avatar_url")
    .in("id", userIds);

  if (error) throw new Error(error.message);

  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      {
        username: p.username as string,
        avatar_url: (p.avatar_url as string | null) ?? null,
      },
    ]),
  );
}

async function countUnreadForThread(
  threadId: string,
  userId: string,
  lastReadAt: string | null,
): Promise<number> {
  const supabase = createClient();
  let query = supabase
    .from("dm_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .neq("sender_id", userId);

  if (lastReadAt) {
    query = query.gt("created_at", lastReadAt);
  }

  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
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
  const profileMap = await fetchProfilesMap(otherIds);

  const { data: reads } = await supabase
    .from("dm_thread_reads")
    .select("thread_id, last_read_at")
    .eq("user_id", user.id);

  const readMap = new Map(
    (reads ?? []).map((r) => [
      r.thread_id as string,
      r.last_read_at as string,
    ]),
  );

  const summaries: DmThreadSummary[] = [];

  for (const row of threads) {
    const otherId = otherParticipantId(row, user.id);
    const profile = profileMap.get(otherId);
    const isInitiator = row.initiated_by === user.id;
    const isRequest =
      row.status === "pending" && !isInitiator;

    const unreadCount = await countUnreadForThread(
      row.id,
      user.id,
      readMap.get(row.id) ?? null,
    );

    summaries.push({
      id: row.id,
      status: row.status,
      isInitiator,
      isRequest,
      otherUserId: otherId,
      otherUsername: profile?.username ?? "unknown",
      otherAvatarUrl: profile?.avatar_url ?? null,
      lastMessagePreview: row.last_message_preview,
      lastMessageAt: row.last_message_at,
      unreadCount,
    });
  }

  return {
    inbox: summaries.filter(
      (t) =>
        t.status === "active" ||
        (t.status === "pending" && t.isInitiator),
    ),
    requests: summaries.filter((t) => t.isRequest),
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
