import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  loadApnsConfigFromEnv,
  sendApnsAlert,
  type ApnsConfig,
} from "./apns.ts";

type MorningDigestRow = {
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

    const since = new Date(jobStartedAt.getTime() - 5_000).toISOString();
    const { data: digests, error: digestError } = await supabase
      .from("notifications")
      .select("user_id, title, body")
      .eq("type", "morning_digest")
      .gte("created_at", since);

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

    let sent = 0;
    let failed = 0;
    const invalidTokenIds: string[] = [];

    for (const row of tokenRows) {
      const digest = digestByUser.get(row.user_id);
      if (!digest) continue;

      const result = await sendApnsPush(config, row.token, digest.title, digest.body);
      if (result.ok) {
        sent += 1;
      } else {
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
      tokens: tokenRows.length,
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
