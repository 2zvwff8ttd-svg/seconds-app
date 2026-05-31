import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const JST = "Asia/Tokyo";

/**
 * 毎日 7:00 JST に実行する日次ジョブ。
 *
 * 処理内容（DB: public.run_daily_morning_job）:
 * 1. pending 動画を published に変更
 * 2. 全ユーザーに 5〜30 秒の撮影時間を daily_assignments に登録
 * 3. 当日公開があったユーザーへ「昨日の動画が公開されました！今日の撮影時間は〇秒です。」
 * 4. それ以外へ「今日の撮影時間は〇秒です。」
 *
 * スケジュール（7:00 JST = 22:00 UTC）:
 *   Dashboard → Edge Functions → daily-morning → Schedules
 *   または SQL: supabase/sql/schedule-daily-morning-cron.sql
 *
 * デプロイ:
 *   npm run functions:deploy-daily-morning
 *
 * シークレット（自動注入）: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * 任意: CRON_SECRET（手動呼び出し時に x-cron-secret ヘッダ）
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
  if (cronSecret) {
    const provided = req.headers.get("x-cron-secret");
    if (provided !== cronSecret) {
      return json({ error: "Unauthorized" }, 401);
    }
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
        hint: "SQL Editor で supabase/sql/daily-morning-job.sql を実行してください。",
      },
      500,
    );
  }

  const elapsedMs = Date.now() - startedAt.getTime();
  console.log("[daily-morning] completed", { result: data, elapsedMs });

  return json({
    ok: true,
    timezone: JST,
    scheduled_hour_jst: 7,
    elapsed_ms: elapsedMs,
    result: data,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
