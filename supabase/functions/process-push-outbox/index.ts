import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { processPushOutbox } from "../_shared/push-outbox-processor.ts";

/**
 * Aggregates pending social push events and sends APNs alerts.
 *
 * Schedule: every 3 minutes (Dashboard → Integrations → Cron / pg_cron)
 *   Like/comment/follow: individual push per event; burst of 5+ within 5 min aggregates.
 *   Mention/crown: always individual immediate.
 *
 * Deploy:
 *   npm run functions:deploy-process-push-outbox
 *
 * Requires SQL: supabase/sql/031-notification-push.sql
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APNS_*
 * Required: CRON_SECRET (x-cron-secret header; missing secret → 500)
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
    console.error("[process-push-outbox] CRON_SECRET is not set");
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

  const startedAt = Date.now();
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const summary = await processPushOutbox(supabase, { includeCrown: false });

  console.log("[process-push-outbox] completed", {
    summary,
    elapsedMs: Date.now() - startedAt,
  });

  return json({ ok: true, elapsed_ms: Date.now() - startedAt, ...summary });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
