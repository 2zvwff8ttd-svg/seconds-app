import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { formatRelativeTime } from "@/lib/utils/format-time";
import type { DmThreadSummary } from "@/types/dm";
import Link from "next/link";

type ThreadRowProps = {
  thread: DmThreadSummary;
  showPendingBadge?: boolean;
};

export function ThreadRow({ thread, showPendingBadge }: ThreadRowProps) {
  const timeLabel = thread.lastMessageAt
    ? formatRelativeTime(thread.lastMessageAt)
    : null;

  return (
    <Link
      href={`/messages/${thread.id}`}
      className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-3 transition hover:border-border hover:bg-surface"
    >
      <ProfileAvatar
        username={thread.otherUsername}
        avatarUrl={thread.otherAvatarUrl}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate font-medium text-foreground">
            @{thread.otherUsername}
          </p>
          {timeLabel && (
            <span className="shrink-0 text-[10px] text-muted">{timeLabel}</span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-sm text-muted">
            {thread.lastMessagePreview ?? "メッセージを開始"}
          </p>
          {showPendingBadge && thread.status === "pending" && thread.isInitiator && (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              承認待ち
            </span>
          )}
          {thread.unreadCount > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-violet-500 px-1.5 text-[10px] font-bold text-white">
              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
