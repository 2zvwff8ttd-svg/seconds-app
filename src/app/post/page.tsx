"use client";

import { PostForm } from "@/components/post/PostForm";
import { BottomNav, DEFAULT_BOTTOM_NAV_INSET } from "@/components/home/BottomNav";
import { useState } from "react";

export default function PostPage() {
  const [bottomInset, setBottomInset] = useState(DEFAULT_BOTTOM_NAV_INSET);

  return (
    <div className="app-page post-page-root flex flex-col bg-black">
      <header className="z-header relative shrink-0 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">投稿</h1>
        <p className="text-[10px] text-muted sm:text-xs">カメラで撮影してvlogを投稿</p>
      </header>

      <div className="min-h-0 flex-1" style={{ paddingBottom: bottomInset }}>
        <PostForm />
      </div>
      <BottomNav onInsetChange={setBottomInset} />
    </div>
  );
}
