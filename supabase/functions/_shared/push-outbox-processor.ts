import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  buildAggregatedPushCopy,
  GLOBAL_PUSH_COOLDOWN_MS,
  PUSH_WINDOW_CONFIG,
  resolveActorLabel,
  type PushNotificationType,
} from "./push-messages.ts";
import {
  loadApnsConfigOrNull,
  recordPushSendLog,
  sendPushAlertToUser,
  type PushDispatchResult,
} from "./push-dispatch.ts";

export type PushOutboxRow = {
  id: string;
  recipient_user_id: string;
  push_type: string;
  actor_id: string | null;
  video_id: string | null;
  comment_id: string | null;
  award_date: string | null;
  bucket_key: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
};

type BucketGroup = {
  bucketKey: string;
  pushType: Exclude<PushNotificationType, "morning_digest">;
  recipientUserId: string;
  events: PushOutboxRow[];
};

export type ProcessPushOutboxSummary = {
  buckets_seen: number;
  buckets_flushed: number;
  buckets_deferred: number;
  buckets_skipped: number;
  events_marked_sent: number;
  events_marked_skipped: number;
  pushes_sent: number;
  pushes_failed: number;
  tokens_disabled: number;
  error?: string;
};

export async function processPushOutbox(
  supabase: SupabaseClient,
  options?: { includeCrown?: boolean },
): Promise<ProcessPushOutboxSummary> {
  const summary: ProcessPushOutboxSummary = {
    buckets_seen: 0,
    buckets_flushed: 0,
    buckets_deferred: 0,
    buckets_skipped: 0,
    events_marked_sent: 0,
    events_marked_skipped: 0,
    pushes_sent: 0,
    pushes_failed: 0,
    tokens_disabled: 0,
  };

  try {
    const config = loadApnsConfigOrNull();
    if (!config) {
      return { ...summary, error: "apns_not_configured" };
    }

    const { data: pendingRows, error: pendingError } = await supabase
      .from("push_outbox")
      .select(
        "id, recipient_user_id, push_type, actor_id, video_id, comment_id, award_date, bucket_key, created_at",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(2000);

    if (pendingError) {
      throw new Error(pendingError.message);
    }

    const rows = (pendingRows ?? []) as PushOutboxRow[];
    if (rows.length === 0) {
      return summary;
    }

    const groups = new Map<string, BucketGroup>();
    for (const row of rows) {
      if (
        row.push_type === "crown" && options?.includeCrown === false
      ) {
        continue;
      }
      if (
        !["like", "comment", "follow", "mention", "crown"].includes(row.push_type)
      ) {
        continue;
      }

      const existing = groups.get(row.bucket_key);
      if (existing) {
        existing.events.push(row);
      } else {
        groups.set(row.bucket_key, {
          bucketKey: row.bucket_key,
          pushType: row.push_type as Exclude<
            PushNotificationType,
            "morning_digest"
          >,
          recipientUserId: row.recipient_user_id,
          events: [row],
        });
      }
    }

    summary.buckets_seen = groups.size;
    const now = Date.now();

    for (const group of groups.values()) {
      const windowConfig = PUSH_WINDOW_CONFIG[group.pushType];
      const oldestMs = Math.min(
        ...group.events.map((e) => new Date(e.created_at).getTime()),
      );
      const ageMs = now - oldestMs;

      if (ageMs < windowConfig.windowMs) {
        summary.buckets_deferred += 1;
        continue;
      }

      const bucketLastSent = await getLatestBucketSendAt(
        supabase,
        group.bucketKey,
      );
      if (
        bucketLastSent &&
        now - bucketLastSent < windowConfig.bucketCooldownMs
      ) {
        summary.buckets_deferred += 1;
        continue;
      }

      if (!windowConfig.bypassGlobalCooldown) {
        const recipientLastSent = await getLatestRecipientSendAt(
          supabase,
          group.recipientUserId,
        );
        if (
          recipientLastSent &&
          now - recipientLastSent < GLOBAL_PUSH_COOLDOWN_MS
        ) {
          summary.buckets_deferred += 1;
          continue;
        }
      }

      const actorIds = uniqueActorIds(group.events);
      const actorCount = Math.max(actorIds.length, 1);
      const primaryActorId = pickPrimaryActorId(group.events);
      const primaryLabel = await resolvePrimaryActorLabel(
        supabase,
        primaryActorId,
      );
      const copy = buildAggregatedPushCopy(
        group.pushType,
        primaryLabel,
        actorCount,
      );

      const dispatch: PushDispatchResult = await sendPushAlertToUser(
        supabase,
        config,
        group.recipientUserId,
        group.pushType,
        copy.title,
        copy.body,
      );

      if (dispatch.skipped && dispatch.reason === "pref_off") {
        await markBucketRows(supabase, group, "skipped", "pref_off");
        summary.buckets_skipped += 1;
        summary.events_marked_skipped += group.events.length;
        continue;
      }

      if (dispatch.skipped && dispatch.reason === "no_token") {
        await markBucketRows(supabase, group, "skipped", "no_token");
        summary.buckets_skipped += 1;
        summary.events_marked_skipped += group.events.length;
        continue;
      }

      if (dispatch.sent > 0) {
        await recordPushSendLog(supabase, {
          recipientUserId: group.recipientUserId,
          pushType: group.pushType,
          bucketKey: group.bucketKey,
          actorCount,
          title: copy.title,
          body: copy.body,
        });
        await markBucketRows(supabase, group, "sent", null);
        summary.buckets_flushed += 1;
        summary.events_marked_sent += group.events.length;
        summary.pushes_sent += dispatch.sent;
      } else {
        summary.buckets_deferred += 1;
      }

      summary.pushes_failed += dispatch.failed;
      summary.tokens_disabled += dispatch.disabled;
    }

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[process-push-outbox] failed", message);
    return { ...summary, error: message };
  }
}

async function getLatestBucketSendAt(
  supabase: SupabaseClient,
  bucketKey: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("push_send_log")
    .select("sent_at")
    .eq("bucket_key", bucketKey)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.sent_at) return null;
  return new Date(data.sent_at as string).getTime();
}

async function getLatestRecipientSendAt(
  supabase: SupabaseClient,
  recipientUserId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("push_send_log")
    .select("sent_at")
    .eq("recipient_user_id", recipientUserId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.sent_at) return null;
  return new Date(data.sent_at as string).getTime();
}

function uniqueActorIds(events: PushOutboxRow[]): string[] {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.actor_id) ids.add(event.actor_id);
  }
  return [...ids];
}

function pickPrimaryActorId(events: PushOutboxRow[]): string | null {
  const sorted = [...events].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  for (const event of sorted) {
    if (event.actor_id) return event.actor_id;
  }
  return null;
}

async function resolvePrimaryActorLabel(
  supabase: SupabaseClient,
  actorId: string | null,
): Promise<string> {
  if (!actorId) return "だれか";

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .eq("id", actorId)
    .maybeSingle();

  if (error || !data) return "だれか";
  const profile = data as ProfileRow;
  return resolveActorLabel(profile.display_name, profile.username);
}

async function markBucketRows(
  supabase: SupabaseClient,
  group: BucketGroup,
  status: "sent" | "skipped",
  skipReason: string | null,
): Promise<void> {
  const ids = group.events.map((e) => e.id);
  const patch: Record<string, unknown> = {
    status,
    sent_at: new Date().toISOString(),
  };
  if (skipReason) patch.skip_reason = skipReason;

  const { error } = await supabase
    .from("push_outbox")
    .update(patch)
    .in("id", ids);

  if (error) {
    console.warn("[process-push-outbox] markBucketRows failed", error.message);
  }
}

export async function flushCrownPushOutbox(
  supabase: SupabaseClient,
): Promise<ProcessPushOutboxSummary> {
  return processPushOutbox(supabase, { includeCrown: true });
}
