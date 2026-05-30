import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "./env";

/**
 * Browser / Client Component用 Supabase クライアント
 * @example
 * const supabase = createClient();
 * const { data } = await supabase.from("posts").select();
 */
export function createClient() {
  return createBrowserClient(getSupabaseUrl(), getSupabaseAnonKey());
}
