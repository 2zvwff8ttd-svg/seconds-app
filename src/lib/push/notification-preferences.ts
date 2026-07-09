import { createClient } from "@/lib/supabase/client";

/** App-level preference keys (maps to push_* DB columns). */
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

/** DB column names avoid SQL reserved words (like, comment). */
const PREF_DB_COLUMN: Record<PushPreferenceKey, string> = {
  morning_digest: "push_morning_digest",
  like: "push_like",
  comment: "push_comment",
  follow: "push_follow",
  mention: "push_mention",
  crown: "push_crown",
};

const DB_COLUMNS_SELECT = Object.values(PREF_DB_COLUMN).join(", ");

type PreferencesDbRow = {
  user_id?: string;
  push_morning_digest?: boolean;
  push_like?: boolean;
  push_comment?: boolean;
  push_follow?: boolean;
  push_mention?: boolean;
  push_crown?: boolean;
};

function rowToPreferences(row: PreferencesDbRow): PushNotificationPreferences {
  return {
    morning_digest: row.push_morning_digest ?? true,
    like: row.push_like ?? true,
    comment: row.push_comment ?? true,
    follow: row.push_follow ?? true,
    mention: row.push_mention ?? true,
    crown: row.push_crown ?? true,
  };
}

function preferencesToDbRow(
  prefs: PushNotificationPreferences,
  userId: string,
): Record<string, unknown> {
  return {
    user_id: userId,
    push_morning_digest: prefs.morning_digest,
    push_like: prefs.like,
    push_comment: prefs.comment,
    push_follow: prefs.follow,
    push_mention: prefs.mention,
    push_crown: prefs.crown,
    updated_at: new Date().toISOString(),
  };
}

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
    .select(DB_COLUMNS_SELECT)
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

  return rowToPreferences(data as PreferencesDbRow);
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

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(preferencesToDbRow(next, user.id), { onConflict: "user_id" });

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

export { PREFERENCE_KEYS, DEFAULT_PREFERENCES, PREF_DB_COLUMN };
