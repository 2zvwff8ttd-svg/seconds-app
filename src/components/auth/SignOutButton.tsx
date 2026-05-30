"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-full border border-border bg-surface-elevated px-2.5 py-1 text-[10px] font-medium text-muted transition hover:text-foreground disabled:opacity-50 sm:px-3 sm:py-1 sm:text-[10px]"
      aria-label="ログアウト"
    >
      {loading ? "…" : "ログアウト"}
    </button>
  );
}
