"use client";

import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { fetchIsAdmin } from "@/lib/admin/auth";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetchIsAdmin()
      .then((isAdmin) => {
        if (!isAdmin) {
          router.replace("/");
          return;
        }
        setAllowed(true);
      })
      .catch(() => router.replace("/"));
  }, [router]);

  if (allowed !== true) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black">
        <p className="text-sm text-muted">読み込み中…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative shrink-0 border-b border-border px-4 pb-4 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:text-foreground"
            aria-label="ホームに戻る"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
              管理者ダッシュボード
            </h1>
            <p className="text-[10px] text-muted sm:text-xs">
              通報の確認とモデレーション
            </p>
          </div>
        </div>
      </header>

      <AdminDashboard />
    </div>
  );
}
