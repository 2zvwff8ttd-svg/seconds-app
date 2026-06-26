import { escapeIlikePattern } from "@/lib/search/escape-ilike";
import { createClient } from "@/lib/supabase/client";
import type { SearchUserResult } from "@/types/search";

const SEARCH_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

export async function searchUsers(query: string): Promise<SearchUserResult[]> {
  const term = query.trim();
  if (term.length < MIN_QUERY_LENGTH) return [];

  const supabase = createClient();
  const pattern = `%${escapeIlikePattern(term)}%`;

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
    .order("username", { ascending: true })
    .limit(SEARCH_LIMIT);

  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const counts = await Promise.all(
    data.map(async (row) => {
      const { count, error: countError } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", row.id);

      if (countError) throw new Error(countError.message);
      return count ?? 0;
    }),
  );

  return data.map((row, index) => ({
    userId: row.id,
    username: row.username,
    displayName: (row.display_name as string | null) ?? null,
    avatarUrl: row.avatar_url ?? null,
    followerCount: counts[index] ?? 0,
  }));
}
