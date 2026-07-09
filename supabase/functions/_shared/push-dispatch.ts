import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  loadApnsConfigFromEnv,
  sendApnsAlert,
  type ApnsConfig,
} from "./apns.ts";
import type { PushNotificationType } from "./push-messages.ts";

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
};

export type PushDispatchResult = {
  sent: number;
  failed: number;
  disabled: number;
  skipped?: boolean;
  reason?: string;
};

export async function isUserPushEnabled(
  supabase: SupabaseClient,
  userId: string,
  pushType: PushNotificationType,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("user_push_enabled", {
    p_user_id: userId,
    p_push_type: pushType,
  });

  if (error) {
    console.warn("[push-dispatch] user_push_enabled failed", {
      userId,
      pushType,
      message: error.message,
    });
    return true;
  }

  return data !== false;
}

export async function sendPushAlertToUser(
  supabase: SupabaseClient,
  config: ApnsConfig,
  userId: string,
  pushType: PushNotificationType,
  title: string,
  body: string,
): Promise<PushDispatchResult> {
  const enabled = await isUserPushEnabled(supabase, userId, pushType);
  if (!enabled) {
    return { sent: 0, failed: 0, disabled: 0, skipped: true, reason: "pref_off" };
  }

  const { data: tokens, error: tokenError } = await supabase
    .from("push_device_tokens")
    .select("id, user_id, token")
    .eq("user_id", userId)
    .eq("platform", "ios")
    .eq("enabled", true);

  if (tokenError) {
    throw new Error(tokenError.message);
  }

  const tokenRows = (tokens ?? []) as PushTokenRow[];
  if (tokenRows.length === 0) {
    return { sent: 0, failed: 0, disabled: 0, skipped: true, reason: "no_token" };
  }

  let sent = 0;
  let failed = 0;
  const invalidTokenIds: string[] = [];

  for (const row of tokenRows) {
    const result = await sendApnsAlert(config, row.token, { title, body });
    if (result.ok) {
      sent += 1;
    } else {
      failed += 1;
      if (result.tokenInvalid) {
        invalidTokenIds.push(row.id);
      }
      console.warn("[push-dispatch] APNs send failed", {
        tokenId: row.id,
        userId: row.user_id,
        pushType,
        status: result.status,
        reason: result.reason,
      });
    }
  }

  if (invalidTokenIds.length > 0) {
    const { error: disableError } = await supabase
      .from("push_device_tokens")
      .update({ enabled: false })
      .in("id", invalidTokenIds);

    if (disableError) {
      console.warn(
        "[push-dispatch] failed to disable invalid tokens",
        disableError.message,
      );
    }
  }

  return {
    sent,
    failed,
    disabled: invalidTokenIds.length,
  };
}

export async function recordPushSendLog(
  supabase: SupabaseClient,
  input: {
    recipientUserId: string;
    pushType: string;
    bucketKey: string;
    actorCount: number;
    title: string;
    body: string;
  },
): Promise<void> {
  const { error } = await supabase.from("push_send_log").insert({
    recipient_user_id: input.recipientUserId,
    push_type: input.pushType,
    bucket_key: input.bucketKey,
    actor_count: input.actorCount,
    title: input.title,
    body: input.body,
  });

  if (error) {
    console.warn("[push-dispatch] push_send_log insert failed", error.message);
  }
}

export function loadApnsConfigOrNull(): ApnsConfig | null {
  return loadApnsConfigFromEnv();
}
