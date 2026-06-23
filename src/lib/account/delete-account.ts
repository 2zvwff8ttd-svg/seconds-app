import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

export async function deleteOwnAccount(): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("ログインが必要です");
  }

  const response = await fetch(`${getSupabaseUrl()}/functions/v1/delete-account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
  });

  let payload: { error?: string; ok?: boolean } = {};
  try {
    payload = (await response.json()) as { error?: string; ok?: boolean };
  } catch {
    // ignore JSON parse errors
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "アカウントの削除に失敗しました");
  }

  if (!payload.ok) {
    throw new Error(payload.error ?? "アカウントの削除に失敗しました");
  }
}
