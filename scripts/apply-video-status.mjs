/**
 * Applies supabase/migrations/004_add_video_status.sql to the linked Supabase project.
 *
 * Set in .env.local (Dashboard → Settings → Database → Database password):
 *   SUPABASE_DB_PASSWORD=your-password
 * Or the full connection string:
 *   DATABASE_URL=postgresql://postgres:...@db.ynnabzfgkrrqrtrdckyk.supabase.co:5432/postgres
 *
 * Usage: npm run db:apply-status
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
        "Missing database credentials.",
        "",
        "Add to .env.local:",
        "  SUPABASE_DB_PASSWORD=<Dashboard → Settings → Database → Database password>",
        "",
        "Or:",
        "  DATABASE_URL=postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres",
        "",
        "Then run: npm run db:apply-status",
      ].join("\n"),
    );
    process.exit(1);
  }

  const ref = projectRefFromEnv();
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres:${encoded}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  loadEnvLocal();

  const sqlPath = join(root, "supabase", "migrations", "004_add_video_status.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const connectionString = buildConnectionString();

  console.log("Connecting to Supabase Postgres…");
  const sqlClient = postgres(connectionString, {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
  });

  try {
    console.log("Applying 004_add_video_status.sql …");
    await sqlClient.unsafe(sql);
    console.log("Done. Verifying columns…");

    const rows = await sqlClient`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'videos'
        and column_name in ('status', 'publish_at', 'published_at')
      order by column_name
    `;

    const names = rows.map((r) => r.column_name);
    if (names.length < 3) {
      console.error("Verification failed. Found columns:", names);
      process.exit(1);
    }

    console.log("OK:", names.join(", "));
    console.log("PostgREST schema reload was sent (NOTIFY pgrst). Retry posting in ~10s.");
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
