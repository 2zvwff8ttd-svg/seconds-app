import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendMorningDigestPushes } from "../_shared/morning-digest-push.ts";
import { flushCrownPushOutbox } from "../_shared/push-outbox-processor.ts";
import {
  expireRetentionVideos,
} from "../_shared/video-retention-expiry.ts";

const JST = "Asia/Tokyo";

/**
 * 毎日 7:00 JST に実行する日次ジョブ。
 *
 * 処理内容（DB: public.run_daily_morning_job）:
 * 1. pending 動画を published に変更
 * 2. 前日（JST）の国別 #1 を award_daily_crowns で確定（video_daily_views + 10日クールダウン）
 * 3. 全ユーザーに 5〜30 秒の撮影時間を daily_assignments に登録
 * 4. 全ユーザーへ morning_digest 通知（title: ?Seconds / body: 固定コピー、秒数は出さない）
 * 5. enabled な iOS トークンへ morning_digest APNs 送信（notification_preferences 尊重）
 * 6. 王冠プッシュ（push_outbox crown を即時フラッシュ）
 * 7. 10日保持期限切れ動画の削除（app_config.video_retention.expiry_enabled=true のときのみ）
 *
 * Crown / push outbox schema:
 *   supabase/sql/031-notification-push.sql
 *
 * Crown schema / award_daily_crowns は SQL Editor で:
 *   supabase/sql/030-crown-awards.sql
 *
 * スケジュール（7:00 JST = 22:00 UTC）:
 *   Dashboard → Edge Functions → daily-morning → Schedules
 *   または SQL: supabase/sql/schedule-daily-morning-cron.sql
 *
 * デプロイ:
 *   npm run functions:deploy-daily-morning
 *
 * シークレット（自動注入）: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 必須: CRON_SECRET（呼び出し時に x-cron-secret ヘッダ。未設定だと 500）
 * プッシュ: APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_BUNDLE_ID, APNS_ENVIRONMENT
 * デバッグ: APNS_DEBUG_JWT=true（既定）で [apns-jwt-debug] を Logs に出力。終了後 false
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-cron-secret, content-type",
      },
    });
  }

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("[daily-morning] CRON_SECRET is not set");
    return json({ error: "Server misconfigured: CRON_SECRET required" }, 500);
  }
  const provided = req.headers.get("x-cron-secret");
  if (provided !== cronSecret) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceKey) {
    return json(
      { error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" },
      500,
    );
  }

  const startedAt = new Date();
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("run_daily_morning_job");

  if (error) {
    console.error("[daily-morning] RPC failed:", error.message);
    return json(
      {
        ok: false,
        error: error.message,
        hint: "SQL Editor で supabase/sql/030-crown-awards.sql を実行してください（run_daily_morning_job 含む）。",
      },
      500,
    );
  }

  const pushSummary = await sendMorningDigestPushes(supabase, startedAt);
  const crownPushSummary = await flushCrownPushOutbox(supabase);

  let retentionSummary: Record<string, unknown> = { skipped: true };
  try {
    const retention = await expireRetentionVideos(supabase, supabaseUrl, {
      apply: false,
    });
    const applyExpiry = retention.config.expiry_enabled;
    const applied = applyExpiry
      ? await expireRetentionVideos(supabase, supabaseUrl, { apply: true })
      : null;

    retentionSummary = {
      policy_start_jst: retention.config.policy_start_jst,
      retention_days: retention.config.retention_days,
      expiry_enabled: retention.config.expiry_enabled,
      candidates: retention.candidates.length,
      deleted: applied?.deleted ?? 0,
      failed: applied?.failed ?? [],
      dry_run_only: !applyExpiry,
    };
  } catch (retentionErr) {
    console.error("[daily-morning] retention expiry failed:", retentionErr);
    retentionSummary = {
      error: retentionErr instanceof Error
        ? retentionErr.message
        : String(retentionErr),
    };
  }

  const elapsedMs = Date.now() - startedAt.getTime();
  console.log("[daily-morning] completed", {
    result: data,
    push: pushSummary,
    crown_push: crownPushSummary,
    retention: retentionSummary,
    elapsedMs,
  });

  return json({
    ok: true,
    timezone: JST,
    scheduled_hour_jst: 7,
    elapsed_ms: elapsedMs,
    result: data,
    push: pushSummary,
    crown_push: crownPushSummary,
    retention: retentionSummary,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
