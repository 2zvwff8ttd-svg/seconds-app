import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  loadApnsConfigFromEnv,
  sendApnsAlert,
  type ApnsConfig,
} from "./apns.ts";
import { isUserPushEnabled } from "./push-dispatch.ts";

type MorningDigestRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
};

type PushTokenRow = {
  id: string;
  user_id: string;
  token: string;
};

export type MorningDigestPushSummary = {
  skipped?: boolean;
  reason?: string;
  sent?: number;
  failed?: number;
  disabled?: number;
  digests?: number;
  tokens?: number;
  pref_skipped?: number;
  error?: string;
};

export async function sendMorningDigestPushes(
  supabase: SupabaseClient,
  jobStartedAt: Date,
): Promise<MorningDigestPushSummary> {
  try {
    const config = loadApnsConfigFromEnv();
    if (!config) {
      console.warn("[morning-digest-push] APNs secrets missing; skipping push");
      return { skipped: true, reason: "apns_not_configured" };
    }

    const { start, end } = jstDayBounds(jobStartedAt);
    const { data: digests, error: digestError } = await supabase
      .from("notifications")
      .select("id, user_id, title, body")
      .eq("type", "morning_digest")
      .gte("created_at", start.toISOString())
      .lt("created_at", end.toISOString());

    if (digestError) {
      throw new Error(digestError.message);
    }

    const digestRows = (digests ?? []) as MorningDigestRow[];
    if (digestRows.length === 0) {
      return { sent: 0, failed: 0, disabled: 0, digests: 0, tokens: 0 };
    }

    const digestByUser = new Map(
      digestRows.map((row) => [row.user_id, row]),
    );

    const { data: tokens, error: tokenError } = await supabase
      .from("push_device_tokens")
      .select("id, user_id, token")
      .eq("platform", "ios")
      .eq("enabled", true);

    if (tokenError) {
      throw new Error(tokenError.message);
    }

    const tokenRows = (tokens ?? []) as PushTokenRow[];
    if (tokenRows.length === 0) {
      return {
        sent: 0,
        failed: 0,
        disabled: 0,
        digests: digestRows.length,
        tokens: 0,
      };
    }

    // Same physical device can appear twice in push_device_tokens; send once per APNs token.
    const uniqueTokens: PushTokenRow[] = [];
    const seenTokenValues = new Set<string>();
    for (const row of tokenRows) {
      const key = row.token.trim();
      if (!key || seenTokenValues.has(key)) continue;
      seenTokenValues.add(key);
      uniqueTokens.push(row);
    }

    let sent = 0;
    let failed = 0;
    let prefSkipped = 0;
    const invalidTokenIds: string[] = [];

    for (const row of uniqueTokens) {
      const digest = digestByUser.get(row.user_id);
      if (!digest) continue;

      const pushEnabled = await isUserPushEnabled(
        supabase,
        row.user_id,
        "morning_digest",
      );
      if (!pushEnabled) {
        prefSkipped += 1;
        continue;
      }

      const claimed = await claimMorningDigestDelivery(
        supabase,
        digest.id,
        row.id,
      );
      if (!claimed) continue;

      let result;
      try {
        result = await sendApnsPush(config, row.token, digest.title, digest.body);
      } catch (err) {
        await releaseMorningDigestDelivery(supabase, digest.id, row.id);
        throw err;
      }

      if (result.ok) {
        sent += 1;
      } else {
        await releaseMorningDigestDelivery(supabase, digest.id, row.id);
        failed += 1;
        if (result.tokenInvalid) {
          invalidTokenIds.push(row.id);
        }
        console.warn("[morning-digest-push] APNs send failed", {
          tokenId: row.id,
          userId: row.user_id,
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
          "[morning-digest-push] failed to disable invalid tokens",
          disableError.message,
        );
      }
    }

    return {
      sent,
      failed,
      disabled: invalidTokenIds.length,
      digests: digestRows.length,
      tokens: uniqueTokens.length,
      pref_skipped: prefSkipped,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[morning-digest-push] dispatch failed", message);
    return { error: message };
  }
}

async function sendApnsPush(
  config: ApnsConfig,
  token: string,
  title: string,
  body: string,
) {
  return sendApnsAlert(config, token, { title, body });
}

async function claimMorningDigestDelivery(
  supabase: SupabaseClient,
  notificationId: string,
  tokenId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("morning_digest_push_deliveries")
    .insert({
      notification_id: notificationId,
      push_token_id: tokenId,
    })
    .select("notification_id");

  if (!error) return (data?.length ?? 0) === 1;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

async function releaseMorningDigestDelivery(
  supabase: SupabaseClient,
  notificationId: string,
  tokenId: string,
): Promise<void> {
  const { error } = await supabase
    .from("morning_digest_push_deliveries")
    .delete()
    .eq("notification_id", notificationId)
    .eq("push_token_id", tokenId);

  if (error) {
    console.warn(
      "[morning-digest-push] failed to release delivery claim",
      error.message,
    );
  }
}

function jstDayBounds(date: Date): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const value = (type: string): number => {
    const part = parts.find((item) => item.type === type)?.value;
    if (!part) throw new Error(`Missing JST date part: ${type}`);
    return Number(part);
  };

  const start = new Date(
    Date.UTC(value("year"), value("month") - 1, value("day")) - 9 * 60 * 60 * 1000,
  );
  return {
    start,
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
  };
}
