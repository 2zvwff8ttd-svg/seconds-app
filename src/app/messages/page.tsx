"use client";

import { useBottomNavInset } from "@/components/layout/BottomNavInset";
import { MessagesScreen } from "@/components/messages/MessagesScreen";

export default function MessagesPage() {
  const bottomInset = useBottomNavInset();

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <header className="z-header relative shrink-0 px-4 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h1 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
          メッセージ
        </h1>
        <p className="text-[10px] text-muted sm:text-xs">1対1のダイレクトメッセージ</p>
      </header>

      <div className="min-h-0 flex-1" style={{ paddingBottom: bottomInset }}>
        <MessagesScreen />
      </div>
    </div>
  );
}
