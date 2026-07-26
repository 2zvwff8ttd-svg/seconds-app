import type { SupabaseClient } from "@supabase/supabase-js";

/** Returns true if the signed-in user is banned (fail-closed on lookup error). */
export async function isCurrentUserBanned(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profiles")
    .select("is_banned")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[assert-not-banned] profile lookup failed", error.message);
    return true;
  }

  return Boolean(data?.is_banned);
}
