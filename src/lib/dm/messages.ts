import { createClient } from "@/lib/supabase/client";
import { mapSocialWriteError } from "@/lib/social/write-errors";
import type { DmMessage, DmThreadStatus } from "@/types/dm";

export async function fetchDmMessages(threadId: string): Promise<DmMessage[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("ログインが必要です");

  const { data, error } = await supabase
    .from("dm_messages")
    .select("id, thread_id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    threadId: row.thread_id as string,
    senderId: row.sender_id as string,
    body: row.body as string,
    createdAt: row.created_at as string,
    isMine: row.sender_id === user.id,
  }));
}

export async function sendDmMessage(
  recipientId: string,
  body: string,
): Promise<{ threadId: string; status: DmThreadStatus }> {
  const trimmed = body.trim();
  if (!trimmed) {
    throw new Error("メッセージを入力してください");
  }
  if (trimmed.length > 2000) {
    throw new Error("メッセージは2000文字以内にしてください");
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("send_dm_message", {
    p_recipient_id: recipientId,
    p_body: trimmed,
  });

  if (error) throw new Error(mapSocialWriteError(error.message));

  const row = data as {
    thread_id?: string;
    status?: DmThreadStatus;
  };

  if (!row?.thread_id) {
    throw new Error("メッセージの送信に失敗しました");
  }

  return {
    threadId: row.thread_id,
    status: row.status ?? "pending",
  };
}

export async function markDmThreadRead(threadId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  const { error } = await supabase.from("dm_thread_reads").upsert(
    {
      thread_id: threadId,
      user_id: user.id,
      last_read_at: now,
    },
    { onConflict: "thread_id,user_id" },
  );

  if (error) throw new Error(error.message);
}
