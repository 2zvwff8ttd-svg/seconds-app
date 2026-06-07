"use client";

import { ProfileAvatar } from "@/components/profile/ProfileAvatar";
import {
  adminModerationAction,
  fetchAdminReportQueue,
  formatReportReasonSummary,
} from "@/lib/admin/reports";
import { formatRelativeTime } from "@/lib/utils/format-time";
import type { AdminReportGroup, ReportTargetType } from "@/types/report";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const TARGET_TYPE_LABEL: Record<ReportTargetType, string> = {
  video: "動画",
  comment: "コメント",
  profile: "ユーザー",
};

export function AdminDashboard() {
  const [groups, setGroups] = useState<AdminReportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await fetchAdminReportQueue();
      setGroups(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = async (
    group: AdminReportGroup,
    action: "dismiss" | "ban",
  ) => {
    const key = `${group.targetType}:${group.targetId}`;
    setActingKey(key);
    setError(null);
    try {
      await adminModerationAction({
        targetType: group.targetType,
        targetId: group.targetId,
        action,
      });
      setGroups((prev) =>
        prev.filter(
          (g) =>
            !(
              g.targetType === group.targetType &&
              g.targetId === group.targetId
            ),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作に失敗しました");
    } finally {
      setActingKey(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
      {error && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted">読み込み中…</p>
      ) : groups.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted">
          対応待ちの通報はありません
        </p>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          {groups.map((group) => {
            const key = `${group.targetType}:${group.targetId}`;
            const busy = actingKey === key;

            return (
              <article
                key={key}
                className="rounded-2xl border border-border bg-surface-elevated p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-violet-300">
                        {TARGET_TYPE_LABEL[group.targetType]}
                      </span>
                      <span className="rounded-full bg-red-500/15 px-2.5 py-0.5 text-xs font-bold text-red-300">
                        {group.reportCount}件の通報
                      </span>
                      {group.isHidden && (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                          一時非表示中
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      最終通報: {formatRelativeTime(group.lastReportedAt)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {formatReportReasonSummary(group.reasons)}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex gap-3 rounded-xl border border-border bg-surface p-3">
                  {group.targetType === "video" && group.preview.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={group.preview.imageUrl}
                      alt=""
                      className="h-16 w-11 shrink-0 rounded-lg border border-border object-cover"
                    />
                  ) : group.targetType === "profile" ? (
                    <ProfileAvatar
                      username={
                        group.preview.ownerUsername ??
                        group.preview.title.replace(/^@/, "")
                      }
                      avatarUrl={group.preview.imageUrl}
                      size="md"
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 text-sm font-medium text-foreground">
                      {group.preview.title}
                    </p>
                    {group.preview.subtitle && (
                      <p className="mt-1 text-xs text-muted">
                        {group.preview.subtitle}
                      </p>
                    )}
                    {group.preview.link && (
                      <Link
                        href={group.preview.link}
                        className="mt-2 inline-block text-xs text-violet-300 hover:underline"
                      >
                        コンテンツを確認 →
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => void handleAction(group, "dismiss")}
                    disabled={busy}
                    className="flex-1 rounded-xl border border-border bg-surface py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-elevated disabled:opacity-50"
                  >
                    {busy ? "処理中…" : "問題なし（非表示解除）"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAction(group, "ban")}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
                  >
                    {busy ? "処理中…" : "バン（アカウント停止）"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
