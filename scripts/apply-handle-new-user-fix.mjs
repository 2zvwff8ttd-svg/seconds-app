/**
 * Applies supabase/migrations/017_fix_handle_new_user.sql
 *
 * .env.local:
 *   SUPABASE_DB_PASSWORD=...
 * or DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *
 * Usage: npm run db:apply-handle-new-user
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnvLocal() {
  const path = join(root, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function projectRefFromEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([^.]+)\.supabase.co/);
  return match?.[1] ?? "ynnabzfgkrrqrtrdckyk";
}

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    console.error(
      [
        "Missing SUPABASE_DB_PASSWORD in .env.local",
        "Dashboard → Settings → Database → Database password",
        "",
        "Or run supabase/sql/017-fix-handle-new-user.sql in SQL Editor.",
      ].join("\n"),
    );
    process.exit(1);
  }
  const ref = projectRefFromEnv();
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  loadEnvLocal();
  const sqlPath = join(root, "supabase", "migrations", "017_fix_handle_new_user.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const sqlClient = postgres(buildConnectionString(), {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
  });

  try {
    console.log("Applying 017_fix_handle_new_user.sql …");
    await sqlClient.unsafe(sql);

    const fn = await sqlClient`
      select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'handle_new_user'
    `;
    const hasSanitize = fn[0]?.def?.includes("regexp_replace");
    console.log(hasSanitize ? "OK: handle_new_user updated" : "WARN: function may be stale");
  } finally {
    await sqlClient.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
