"use client";

import { ChatScreen } from "@/components/messages/ChatScreen";
import { use } from "react";

type PageProps = {
  params: Promise<{ threadId: string }>;
};

export default function MessageThreadPage({ params }: PageProps) {
  const { threadId } = use(params);

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <ChatScreen threadId={threadId} />
    </div>
  );
}
