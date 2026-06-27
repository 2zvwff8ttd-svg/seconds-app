import { createClient } from "@/lib/supabase/client";

export type MentionProfile = {
  userId: string;
  username: string;
  displayName: string | null;
};

/** Batch-resolve @usernames to profiles in a single query. Map keyed by lowercase username. */
export async function resolveMentionProfiles(
  usernames: string[],
): Promise<Map<string, MentionProfile>> {
  const normalized = [
    ...new Set(
      usernames
        .map((u) => u.trim().toLowerCase())
        .filter((u) => u.length >= 2),
    ),
  ];

  const result = new Map<string, MentionProfile>();
  if (normalized.length === 0) return result;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("username", normalized);

  if (error) throw new Error(error.message);

  for (const row of data ?? []) {
    const username = row.username as string;
    result.set(username.toLowerCase(), {
      userId: row.id as string,
      username,
      displayName: (row.display_name as string | null) ?? null,
    });
  }

  return result;
}
