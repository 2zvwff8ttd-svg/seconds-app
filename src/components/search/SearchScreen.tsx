"use client";

import { UserAvatar } from "@/components/search/UserAvatar";
import { UserIdentity } from "@/components/profile/UserIdentity";
import {
  addSearchHistory,
  getSearchHistory,
  removeSearchHistory,
  type SearchHistoryEntry,
} from "@/lib/search/history";
import { searchUsers } from "@/lib/search/users";
import { searchVideos } from "@/lib/search/videos";
import type { SearchTab, SearchUserResult, SearchVideoResult } from "@/types/search";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 300;
const MIN_LEN = 2;

function formatFollowerCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

export function SearchScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<SearchTab>("users");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUserResult[]>([]);
  const [videos, setVideos] = useState<SearchVideoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<SearchHistoryEntry[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    setHistory(getSearchHistory());
  }, []);

  const runSearch = useCallback(async (term: string, activeTab: SearchTab) => {
    const id = ++requestId.current;
    const trimmed = term.trim();

    if (trimmed.length < MIN_LEN) {
      setUsers([]);
      setVideos([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (activeTab === "users") {
        const results = await searchUsers(trimmed);
        if (requestId.current !== id) return;
        setUsers(results);
        setVideos([]);
      } else {
        const results = await searchVideos(trimmed);
        if (requestId.current !== id) return;
        setVideos(results);
        setUsers([]);
      }
      // Persist only after a real search ran (2+ chars).
      if (requestId.current === id) {
        setHistory(addSearchHistory(trimmed, activeTab));
      }
    } catch (err) {
      if (requestId.current !== id) return;
      setError(err instanceof Error ? err.message : "検索に失敗しました");
      setUsers([]);
      setVideos([]);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void runSearch(query, tab);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, tab, runSearch]);

  const applyHistoryEntry = (entry: SearchHistoryEntry) => {
    setTab(entry.tab);
    setQuery(entry.query);
  };

  const deleteHistoryEntry = (
    e: React.MouseEvent,
    entry: SearchHistoryEntry,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setHistory(removeSearchHistory(entry.query, entry.tab));
  };

  const showHint = query.trim().length > 0 && query.trim().length < MIN_LEN;
  const showHistory = query.trim().length === 0;
  const showEmpty =
    !loading &&
    !error &&
    query.trim().length >= MIN_LEN &&
    (tab === "users" ? users.length === 0 : videos.length === 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-4 pb-3 pt-1 sm:px-5">
        <label className="relative block">
          <span className="sr-only">検索</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3-3" />
            </svg>
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              tab === "users" ? "ユーザー名で検索" : "動画タイトルで検索"
            }
            autoComplete="off"
            className="w-full rounded-xl border border-border bg-surface py-3 pl-10 pr-4 text-sm text-foreground outline-none placeholder:text-muted/50 focus:border-violet-400/50 focus:ring-1 focus:ring-violet-400/30"
          />
        </label>

        <div
          className="mt-3 flex rounded-xl border border-border bg-surface p-1"
          role="tablist"
          aria-label="検索の種類"
        >
          {(
            [
              { id: "users" as const, label: "ユーザー" },
              { id: "videos" as const, label: "動画" },
            ] as const
          ).map((item) => {
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                  selected
                    ? "bg-violet-500/20 text-violet-200"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
        {showHint && (
          <p className="py-8 text-center text-sm text-muted">
            {MIN_LEN}文字以上入力してください
          </p>
        )}

        {showHistory && (
          <>
            {history.length === 0 ? (
              <p className="whitespace-pre-line py-12 text-center text-sm leading-relaxed text-muted">
                {tab === "users"
                  ? "ユーザー名の一部を入力して\nクリエイターを探せます"
                  : "タイトルの一部を入力して\n動画を探せます"}
              </p>
            ) : (
              <div>
                <p className="mb-2 px-1 text-xs font-medium text-muted">
                  最近の検索
                </p>
                <ul className="divide-y divide-border rounded-xl border border-border bg-surface-elevated/80">
                  {history.map((entry) => (
                    <li key={`${entry.tab}:${entry.query}:${entry.at}`}>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => applyHistoryEntry(entry)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-left transition hover:bg-white/5"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4 shrink-0 text-muted"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <circle cx="12" cy="12" r="9" />
                            <path d="M12 7v5l3 2" />
                          </svg>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-foreground">
                              {entry.query}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              {entry.tab === "users" ? "ユーザー" : "動画"}
                            </p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => deleteHistoryEntry(e, entry)}
                          aria-label={`「${entry.query}」を履歴から削除`}
                          className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted/70 transition hover:bg-white/5 hover:text-muted"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <path d="M6 6l12 12M18 6L6 18" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {loading && query.trim().length >= MIN_LEN && (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            検索中…
          </p>
        )}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </p>
        )}

        {showEmpty && (
          <p className="py-12 text-center text-sm text-muted">
            {tab === "users"
              ? "該当するユーザーが見つかりません"
              : "該当する動画が見つかりません"}
          </p>
        )}

        {tab === "users" && !loading && users.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border bg-surface-elevated/80">
            {users.map((user) => (
              <li key={user.userId}>
                <Link
                  href={`/profile/${user.userId}`}
                  className="flex items-center gap-3 px-3 py-3 transition hover:bg-white/5"
                >
                  <UserAvatar
                    username={user.username}
                    avatarUrl={user.avatarUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <UserIdentity
                      username={user.username}
                      displayName={user.displayName}
                      size="md"
                      layout="stack"
                    />
                    <p className="mt-0.5 text-xs text-muted">
                      フォロワー {formatFollowerCount(user.followerCount)}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 shrink-0 text-muted"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {tab === "videos" && !loading && videos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {videos.map((video) => (
              <li key={video.id}>
                <button
                  type="button"
                  onClick={() => router.push(`/video/${video.id}`)}
                  className="group w-full overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:border-violet-400/40"
                >
                  <div className="relative aspect-[9/16] bg-black">
                    {video.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted">
                        サムネイルなし
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5 p-2.5">
                    <p className="line-clamp-2 text-xs font-medium text-foreground">
                      {video.title}
                    </p>
                    <UserIdentity
                      username={video.creatorName}
                      displayName={video.creatorDisplayName}
                      size="sm"
                      layout="stack"
                    />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
