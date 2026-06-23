import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";

const MEDIA_BUCKET = "media";
const AVATARS_BUCKET = "avatars";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

/**
 * アカウント完全削除（App Store Guideline 5.1.1(v)）
 *
 * 1. JWT で本人確認
 * 2. Storage: media/{uid}/*, avatars/{uid}/*
 * 3. RPC delete_own_account（孤児 reports 等）
 * 4. auth.admin.deleteUser → DB CASCADE
 *
 * デプロイ: npm run functions:deploy-delete-account
 * シークレット（自動注入）: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 */
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

  const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await removeStoragePrefix(supabaseAdmin, MEDIA_BUCKET, user.id);
    await removeStoragePrefix(supabaseAdmin, AVATARS_BUCKET, user.id);

    const { error: rpcError } = await supabaseUser.rpc("delete_own_account");
    if (rpcError) {
      console.error("[delete-account] RPC failed:", rpcError.message);
      return json({ error: mapRpcError(rpcError.message) }, 400);
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
      user.id,
    );
    if (deleteError) {
      console.error("[delete-account] auth delete failed:", deleteError.message);
      return json({ error: "アカウントの削除に失敗しました" }, 500);
    }

    console.log("[delete-account] deleted user", user.id);
    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[delete-account] unexpected error:", message);
    return json({ error: "アカウントの削除に失敗しました" }, 500);
  }
});

async function removeStoragePrefix(
  supabase: SupabaseClient,
  bucket: string,
  prefix: string,
): Promise<void> {
  const stack = [prefix];

  while (stack.length > 0) {
    const current = stack.pop()!;
    let offset = 0;

    while (true) {
      const { data, error } = await supabase.storage.from(bucket).list(current, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`Storage list failed (${bucket}/${current}): ${error.message}`);
      }

      if (!data || data.length === 0) {
        break;
      }

      const filePaths: string[] = [];

      for (const item of data) {
        const path = `${current}/${item.name}`;
        if (item.id === null) {
          stack.push(path);
        } else {
          filePaths.push(path);
        }
      }

      if (filePaths.length > 0) {
        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove(filePaths);
        if (removeError) {
          throw new Error(
            `Storage remove failed (${bucket}): ${removeError.message}`,
          );
        }
      }

      if (data.length < 100) {
        break;
      }
      offset += data.length;
    }
  }
}

function mapRpcError(message: string): string {
  if (message.includes("管理者アカウント")) {
    return message;
  }
  if (message.includes("Unauthorized")) {
    return "ログインが必要です";
  }
  return "アカウントの削除準備に失敗しました";
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
