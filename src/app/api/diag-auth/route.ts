import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

/** Plain JSON diag — middleware auth only, no profile query, minimal body. */
export async function GET() {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const sb = all.filter((c) => c.name.startsWith("sb-"));
  const sbBytes = sb.reduce((sum, c) => sum + c.name.length + c.value.length + 2, 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return NextResponse.json(
    {
      ok: true,
      route: "/api/diag-auth",
      userId: user?.id ?? null,
      cookieCount: all.length,
      sbCookieCount: sb.length,
      sbCookieBytes: sbBytes,
      sbCookieNames: sb.map((c) => c.name),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
