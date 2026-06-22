import { createClient } from "@/lib/supabase/client";

export async function blockUser(userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("block_user", {
    p_blocked_id: userId,
  });

  if (error) {
    if (error.message.includes("Cannot block yourself")) {
      throw new Error("自分自身はブロックできません");
    }
    throw new Error(error.message);
  }
}

export async function unblockUser(userId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("unblock_user", {
    p_blocked_id: userId,
  });

  if (error) {
    throw new Error(error.message);
  }
}
