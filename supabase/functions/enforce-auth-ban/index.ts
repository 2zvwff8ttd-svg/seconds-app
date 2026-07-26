import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

/**
 * After admin_moderation_action ban/unban on profiles, sync Auth ban state
 * so refresh tokens / re-login are blocked (or restored).
 *
 * POST JSON: { userId: string, banned: boolean }
 * Authorization: Bearer <admin user JWT>
 *
 * Deploy: npm run functions:deploy-enforce-auth-ban
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/** Long-lived ban (~100 years). Unban with ban_duration: "none". */
const BAN_DURATION = "876000h";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "Server configuration error" }, 500);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const {
    data: { user },
    error: userError,
  } = await supabaseUser.auth.getUser();

  if (userError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const { data: profile, error: profileError } = await supabaseUser
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: { userId?: string; banned?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const targetUserId = body.userId?.trim();
  if (!targetUserId || typeof body.banned !== "boolean") {
    return json({ error: "userId and banned are required" }, 400);
  }

  if (targetUserId === user.id) {
    return json({ error: "Cannot ban yourself" }, 400);
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
    targetUserId,
    {
      ban_duration: body.banned ? BAN_DURATION : "none",
    },
  );

  if (authError) {
    console.error("[enforce-auth-ban] updateUserById failed", authError.message);
    return json({ error: authError.message }, 500);
  }

  if (body.banned) {
    try {
      const adminAuth = supabaseAdmin.auth.admin as {
        signOut?: (
          userId: string,
          scope?: string,
        ) => Promise<{ error: Error | null }>;
      };
      if (typeof adminAuth.signOut === "function") {
        const { error: signOutError } = await adminAuth.signOut(
          targetUserId,
          "global",
        );
        if (signOutError) {
          console.warn(
            "[enforce-auth-ban] global signOut failed",
            signOutError.message,
          );
        }
      }
    } catch (err) {
      console.warn(
        "[enforce-auth-ban] global signOut skipped",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return json({
    ok: true,
    userId: targetUserId,
    banned: body.banned,
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
