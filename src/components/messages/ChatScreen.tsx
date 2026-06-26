"use client";

import { MessageComposer } from "@/components/messages/MessageComposer";
import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import {
  fetchDmMessages,
  markDmThreadRead,
  sendDmMessage,
} from "@/lib/dm/messages";
import {
  acceptDmRequest,
  declineDmRequest,
  fetchDmThreadMeta,
} from "@/lib/dm/threads";
import { isUserBlockedByMe } from "@/lib/blocks/list";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils/format-time";
import type { DmMessage } from "@/types/dm";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type ChatScreenProps = {
  threadId?: string;
  recipientUserId?: string;
  recipientUsername?: string;
  recipientDisplayName?: string | null;
  recipientAvatarUrl?: string | null;
};

export function ChatScreen({
  threadId: initialThreadId,
  recipientUserId,
  recipientUsername,
  recipientDisplayName,
  recipientAvatarUrl,
}: ChatScreenProps) {
  const router = useRouter();
  const [threadId, setThreadId] = useState(initialThreadId ?? null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(initialThreadId));
  const [error, setError] = useState<string | null>(null);
  const [isRequest, setIsRequest] = useState(false);
  const [status, setStatus] = useState<"pending" | "active" | "declined">("active");
  const [isInitiator, setIsInitiator] = useState(false);
  const [otherUserId, setOtherUserId] = useState(recipientUserId ?? "");
  const [otherUsername, setOtherUsername] = useState(recipientUsername ?? "");
  const [otherDisplayName, setOtherDisplayName] = useState<string | null>(
    recipientDisplayName ?? null,
  );
  const [otherAvatarUrl, setOtherAvatarUrl] = useState(recipientAvatarUrl ?? null);
  const [handlingRequest, setHandlingRequest] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadMessages = useCallback(async (id: string) => {
    const rows = await fetchDmMessages(id);
    setMessages(rows);
    await markDmThreadRead(id);
    requestAnimationFrame(scrollToBottom);
  }, []);

  const loadMeta = useCallback(async (id: string) => {
    const meta = await fetchDmThreadMeta(id);
    if (!meta) return;
    if (await isUserBlockedByMe(meta.otherUserId)) {
      throw new Error("このユーザーとはメッセージのやり取りができません");
    }
    setIsRequest(meta.isRequest);
    setStatus(meta.status);
    setIsInitiator(meta.isInitiator);
    setOtherUserId(meta.otherUserId);
    setOtherUsername(meta.otherUsername);
    setOtherDisplayName(meta.otherDisplayName);
    setOtherAvatarUrl(meta.otherAvatarUrl);
  }, []);

  useEffect(() => {
    if (!initialThreadId) return;

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([
          loadMessages(initialThreadId),
          loadMeta(initialThreadId),
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [initialThreadId, loadMessages, loadMeta]);

  useEffect(() => {
    if (!threadId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`dm-thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${threadId}`,
        },
        async () => {
          try {
            await loadMessages(threadId);
          } catch {
            /* ignore */
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_threads",
          filter: `id=eq.${threadId}`,
        },
        () => {
          void loadMeta(threadId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId, loadMessages, loadMeta]);

  const handleSend = async (body: string) => {
    setError(null);
    try {
      if (threadId) {
        const recipientId = otherUserId || recipientUserId;
        if (!recipientId) throw new Error("送信先が見つかりません");
        await sendDmMessage(recipientId, body);
        await loadMessages(threadId);
      } else if (recipientUserId) {
        const result = await sendDmMessage(recipientUserId, body);
        setThreadId(result.threadId);
        setStatus(result.status);
        setIsInitiator(true);
        router.replace(`/messages/${result.threadId}`);
        await loadMessages(result.threadId);
        await loadMeta(result.threadId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
      throw err;
    }
  };

  const handleAccept = async () => {
    if (!threadId) return;
    setHandlingRequest(true);
    setError(null);
    try {
      await acceptDmRequest(threadId);
      setIsRequest(false);
      setStatus("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "承認に失敗しました");
    } finally {
      setHandlingRequest(false);
    }
  };

  const handleDecline = async () => {
    if (!threadId) return;
    setHandlingRequest(true);
    setError(null);
    try {
      await declineDmRequest(threadId);
      router.push("/messages");
    } catch (err) {
      setError(err instanceof Error ? err.message : "拒否に失敗しました");
    } finally {
      setHandlingRequest(false);
    }
  };

  const composerDisabled =
    status === "declined" ||
    (status === "pending" && isInitiator) ||
    (status === "pending" && isRequest);

  const composerPlaceholder =
    status === "pending" && isInitiator
      ? "相手の承認を待っています"
      : status === "declined"
        ? "このリクエストは拒否されました"
        : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="z-header relative flex shrink-0 items-center gap-3 border-b border-border px-3 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-4 sm:pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/messages"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-muted transition hover:text-foreground"
          aria-label="メッセージ一覧に戻る"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
        <ProfileAvatar
          username={otherUsername || "?"}
          avatarUrl={otherAvatarUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <UserIdentity
            username={otherUsername || "…"}
            displayName={otherDisplayName}
            size="md"
            layout="stack"
          />
          {isRequest && (
            <p className="text-[10px] text-amber-300">メッセージリクエスト</p>
          )}
        </div>
        {otherUserId && (
          <Link
            href={`/profile/${otherUserId}`}
            className="text-xs text-muted transition hover:text-foreground"
          >
            プロフィール
          </Link>
        )}
      </header>

      {isRequest && (
        <div className="shrink-0 border-b border-border bg-surface px-4 py-3">
          <p className="text-sm text-muted">
            フォローしていないユーザーからのメッセージです。承認すると通常のDMとして表示されます。
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void handleAccept()}
              disabled={handlingRequest}
              className="flex-1 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
            >
              承認
            </button>
            <button
              type="button"
              onClick={() => void handleDecline()}
              disabled={handlingRequest}
              className="flex-1 rounded-xl border border-border bg-surface py-2 text-sm font-medium text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
            >
              削除
            </button>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {error && (
          <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted">読み込み中…</p>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            最初のメッセージを送って会話を始めましょう
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.isMine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                    msg.isMine
                      ? "rounded-br-md bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white"
                      : "rounded-bl-md border border-border bg-surface-elevated text-foreground"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                  <p
                    className={`mt-1 text-[10px] ${
                      msg.isMine ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {formatRelativeTime(msg.createdAt)}
                  </p>
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <MessageComposer
        onSend={handleSend}
        disabled={composerDisabled}
        placeholder={composerPlaceholder}
      />
    </div>
  );
}
