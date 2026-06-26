"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import { unblockUser } from "@/lib/blocks/actions";
import { fetchBlockedUsers, type BlockedUserEntry } from "@/lib/blocks/list";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function BlockedUsersSection() {
  const [users, setUsers] = useState<BlockedUserEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchBlockedUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleUnblock = async (userId: string) => {
    setUnblockingId(userId);
    setError(null);
    try {
      await unblockUser(userId);
      setUsers((prev) => prev.filter((user) => user.userId !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "解除に失敗しました");
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-xs font-medium uppercase tracking-wider text-muted">
        ブロックしたユーザー
      </h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-surface-elevated">
        {loading ? (
          <p className="px-4 py-3.5 text-sm text-muted">読み込み中…</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-3.5 text-sm text-muted">
            ブロックしたユーザーはいません
          </p>
        ) : (
          <ul>
            {users.map((user, index) => (
              <li
                key={user.userId}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <ProfileAvatar
                  username={user.username}
                  avatarUrl={user.avatarUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profile/${user.userId}`}
                    className="block transition hover:opacity-90"
                  >
                    <UserIdentity
                      username={user.username}
                      displayName={user.displayName}
                      size="md"
                      layout="stack"
                    />
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => void handleUnblock(user.userId)}
                  disabled={unblockingId === user.userId}
                  className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-violet-400/40 hover:bg-violet-500/10 disabled:opacity-50"
                >
                  {unblockingId === user.userId ? "解除中…" : "解除"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      )}
    </section>
  );
}
