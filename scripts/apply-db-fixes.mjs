/**
 * Applies supabase/sql/apply-all-fixes.sql (status columns + RLS).
 *
 * .env.local:
 *   SUPABASE_DB_PASSWORD=...
 * or DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *
 * Usage: npm run db:apply-fixes
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
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

function projectRefFromEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
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
        "Or run supabase/sql/apply-all-fixes.sql in SQL Editor.",
      ].join("\n"),
    );
    process.exit(1);
  }
  const ref = projectRefFromEnv();
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  loadEnvLocal();
  const sqlPath = join(root, "supabase", "sql", "apply-all-fixes.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const sqlClient = postgres(buildConnectionString(), {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
  });

  try {
    console.log("Applying apply-all-fixes.sql …");
    await sqlClient.unsafe(sql);

    const cols = await sqlClient`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'videos'
        and column_name in ('status', 'publish_at', 'published_at')
      order by column_name
    `;
    const policies = await sqlClient`
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'videos'
    `;

    console.log("Columns:", cols.map((r) => r.column_name).join(", ") || "(none)");
    console.log("Policies:", policies.map((r) => r.policyname).join(", ") || "(none)");
    console.log("Done. Wait ~10s, hard-refresh the app, then post again.");
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
