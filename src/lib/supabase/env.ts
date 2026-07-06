// NOTE:
// - On the server, `process.env.X` is read at runtime.
// - On the client, Next.js only inlines variables that are referenced
//   with a static property access like `process.env.NEXT_PUBLIC_...`.
//   Dynamic access (`process.env[name]`) will be `undefined` on the client.

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  (typeof window === "undefined"
    ? undefined
    : (window as any).__NEXT_PUBLIC_SUPABASE_URL);

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  (typeof window === "undefined"
    ? undefined
    : (window as any).__NEXT_PUBLIC_SUPABASE_ANON_KEY);

function assertEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}. Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

export function getSupabaseUrl() {
  return assertEnv(SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL").replace(
    /[\r\n]+/g,
    "",
  ).trim();
}

export function getSupabaseAnonKey() {
  return assertEnv(SUPABASE_ANON_KEY, "NEXT_PUBLIC_SUPABASE_ANON_KEY").replace(
    /[\r\n]+/g,
    "",
  ).trim();
}
