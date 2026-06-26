import { createClient } from "@/lib/supabase/client";

export type BlockedUserEntry = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  blockedAt: string;
};

function isMissingBlocksTable(error: { message?: string; code?: string }): boolean {
  return (
    error.code === "42P01" ||
    Boolean(error.message?.includes("user_blocks")) ||
    Boolean(error.message?.includes("does not exist"))
  );
}

export async function fetchBlockedUserIds(): Promise<Set<string>> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Set();

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id);

  if (error) {
    if (isMissingBlocksTable(error)) return new Set();
    throw new Error(error.message);
  }

  return new Set((data ?? []).map((row) => row.blocked_id as string));
}

export async function fetchBlockedUsers(): Promise<BlockedUserEntry[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at, profiles:blocked_id(username, display_name, avatar_url)")
    .eq("blocker_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (isMissingBlocksTable(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const profile = row.profiles;
    const profileRow = Array.isArray(profile) ? profile[0] : profile;
    return {
      userId: row.blocked_id as string,
      username: (profileRow?.username as string) ?? "unknown",
      displayName: (profileRow?.display_name as string | null) ?? null,
      avatarUrl: (profileRow?.avatar_url as string | null) ?? null,
      blockedAt: row.created_at as string,
    };
  });
}

export async function isUserBlockedByMe(userId: string): Promise<boolean> {
  const blockedIds = await fetchBlockedUserIds();
  return blockedIds.has(userId);
}
