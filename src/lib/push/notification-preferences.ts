import { createClient } from "@/lib/supabase/client";

export type PushPreferenceKey =
  | "morning_digest"
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "crown";

export type PushNotificationPreferences = Record<PushPreferenceKey, boolean>;

const PREFERENCE_KEYS: PushPreferenceKey[] = [
  "morning_digest",
  "like",
  "comment",
  "follow",
  "mention",
  "crown",
];

const DEFAULT_PREFERENCES: PushNotificationPreferences = {
  morning_digest: true,
  like: true,
  comment: true,
  follow: true,
  mention: true,
  crown: true,
};

type PreferencesRow = Partial<Record<PushPreferenceKey, boolean>> & {
  user_id?: string;
};

export async function fetchPushNotificationPreferences(): Promise<PushNotificationPreferences> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ...DEFAULT_PREFERENCES };
  }

  const { data, error } = await supabase
    .from("notification_preferences")
    .select(
      "morning_digest, like, comment, follow, mention, crown",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    if (
      error.message.includes("does not exist") ||
      error.code === "42P01" ||
      error.code === "PGRST205"
    ) {
      return { ...DEFAULT_PREFERENCES };
    }
    throw new Error(error.message);
  }

  if (!data) {
    return { ...DEFAULT_PREFERENCES };
  }

  const row = data as PreferencesRow;
  return {
    morning_digest: row.morning_digest ?? true,
    like: row.like ?? true,
    comment: row.comment ?? true,
    follow: row.follow ?? true,
    mention: row.mention ?? true,
    crown: row.crown ?? true,
  };
}

export async function upsertPushNotificationPreference(
  key: PushPreferenceKey,
  enabled: boolean,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("ログインが必要です");
  }

  const current = await fetchPushNotificationPreferences();
  const next = { ...current, [key]: enabled };

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      ...next,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

export const PUSH_PREFERENCE_LABELS: Record<
  PushPreferenceKey,
  { title: string; description?: string }
> = {
  morning_digest: {
    title: "朝の通知",
    description: "今日の撮影秒数が届いたとき",
  },
  like: { title: "いいね" },
  comment: { title: "コメント" },
  follow: { title: "フォロー" },
  mention: { title: "メンション" },
  crown: {
    title: "王冠（1位）",
    description: "昨日の1位になったとき",
  },
};

export { PREFERENCE_KEYS, DEFAULT_PREFERENCES };
