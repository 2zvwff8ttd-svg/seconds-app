/**
 * 日次ジョブを手動実行（ローカル検証用）
 *
 * .env.local に必要:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY（Dashboard → Settings → API）
 *
 * Usage: node scripts/invoke-daily-morning.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を .env.local に設定してください。",
    );
    process.exit(1);
  }

  const endpoint = `${url}/functions/v1/daily-morning`;
  const headers = { Authorization: `Bearer ${key}` };
  if (process.env.CRON_SECRET) {
    headers["x-cron-secret"] = process.env.CRON_SECRET;
  }

  console.log("Invoking", endpoint);
  const res = await fetch(endpoint, { method: "POST", headers });
  const text = await res.text();
  console.log(res.status, text);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
