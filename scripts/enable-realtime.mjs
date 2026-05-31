/**
 * Enables Supabase Realtime for likes & comments.
 * Requires SUPABASE_DB_PASSWORD or DATABASE_URL in .env.local
 *
 * Usage: npm run db:enable-realtime
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

function buildConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    console.error(
      [
        "Missing SUPABASE_DB_PASSWORD in .env.local",
        "",
        "Dashboard → Settings → Database → Database password を .env.local に追加:",
        "  SUPABASE_DB_PASSWORD=your-password",
        "",
        "または SQL Editor で supabase/sql/enable-realtime.sql を実行してください。",
      ].join("\n"),
    );
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const ref = match?.[1] ?? "ynnabzfgkrrqrtrdckyk";
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  loadEnvLocal();
  const sqlPath = join(root, "supabase", "sql", "enable-realtime.sql");
  const sql = readFileSync(sqlPath, "utf8");
  const sqlClient = postgres(buildConnectionString(), {
    ssl: "require",
    max: 1,
    connect_timeout: 30,
  });

  try {
    console.log("Enabling Realtime for likes & comments…");
    const rows = await sqlClient.unsafe(sql);
    const tables = Array.isArray(rows)
      ? rows.map((r) => r.tablename).filter(Boolean)
      : [];
    if (tables.length > 0) {
      console.log("Realtime enabled for:", tables.join(", "));
    } else {
      console.log("Done. Verify in Dashboard → Database → Publications → supabase_realtime");
    }
  } finally {
    await sqlClient.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
