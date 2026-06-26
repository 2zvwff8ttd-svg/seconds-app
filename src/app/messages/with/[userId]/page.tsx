"use client";

import { ChatScreen } from "@/components/messages/ChatScreen";
import { fetchProfile } from "@/lib/videos/profile-feed";
import { findDmThreadWithUser } from "@/lib/dm/threads";
import { isUserBlockedByMe } from "@/lib/blocks/list";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";

type PageProps = {
  params: Promise<{ userId: string }>;
};

export default function NewMessagePage({ params }: PageProps) {
  const { userId } = use(params);
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const existingId = await findDmThreadWithUser(userId);
        if (existingId) {
          router.replace(`/messages/${existingId}`);
          return;
        }

        if (await isUserBlockedByMe(userId)) {
          setError("このユーザーとはメッセージのやり取りができません");
          return;
        }

        const profile = await fetchProfile(userId);
        setUsername(profile.username);
        setDisplayName(profile.displayName);
        setAvatarUrl(profile.avatarUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [userId, router]);

  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-black">
        <p className="text-sm text-muted">読み込み中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[100dvh] flex-col items-center justify-center gap-3 bg-black px-6">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-black">
      <ChatScreen
        recipientUserId={userId}
        recipientUsername={username}
        recipientDisplayName={displayName}
        recipientAvatarUrl={avatarUrl}
      />
    </div>
  );
}
