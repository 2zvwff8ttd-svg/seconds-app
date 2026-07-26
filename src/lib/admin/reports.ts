import { reportReasonLabel } from "@/lib/reports/reasons";
import { createClient } from "@/lib/supabase/client";
import { getSupabaseUrl } from "@/lib/supabase/env";
import type {
  AdminModerationAction,
  AdminReportGroup,
  ReportReason,
  ReportTargetType,
} from "@/types/report";

type ReportRow = {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  created_at: string;
};

async function fetchVideoPreview(targetId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("videos")
    .select(
      "id, title, thumbnail_url, moderation_hidden, user_id, profiles!user_id(username)",
    )
    .eq("id", targetId)
    .maybeSingle();

  if (!data) {
    return {
      isHidden: false,
      preview: {
        title: "（削除済みの動画）",
        subtitle: targetId,
      },
    };
  }

  const profile = Array.isArray(data.profiles)
    ? data.profiles[0]
    : data.profiles;

  return {
    isHidden: Boolean(data.moderation_hidden),
    preview: {
      title: data.title as string,
      subtitle: `@${(profile as { username?: string } | null)?.username ?? "unknown"}`,
      imageUrl: (data.thumbnail_url as string | null) ?? null,
      link: `/video/${targetId}`,
      ownerId: data.user_id as string,
      ownerUsername: (profile as { username?: string } | null)?.username,
    },
  };
}

async function fetchCommentPreview(targetId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("comments")
    .select(
      "id, content, moderation_hidden, user_id, video_id, profiles!user_id(username)",
    )
    .eq("id", targetId)
    .maybeSingle();

  if (!data) {
    return {
      isHidden: false,
      preview: {
        title: "（削除済みのコメント）",
        subtitle: targetId,
      },
    };
  }

  const profile = Array.isArray(data.profiles)
    ? data.profiles[0]
    : data.profiles;

  return {
    isHidden: Boolean(data.moderation_hidden),
    preview: {
      title: data.content as string,
      subtitle: `@${(profile as { username?: string } | null)?.username ?? "unknown"}`,
      link: `/video/${data.video_id as string}`,
      ownerId: data.user_id as string,
      ownerUsername: (profile as { username?: string } | null)?.username,
    },
  };
}

async function fetchProfilePreview(targetId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, username, avatar_url, moderation_hidden, is_banned")
    .eq("id", targetId)
    .maybeSingle();

  if (!data) {
    return {
      isHidden: false,
      preview: {
        title: "（削除済みのユーザー）",
        subtitle: targetId,
      },
    };
  }

  return {
    isHidden: Boolean(data.moderation_hidden || data.is_banned),
    preview: {
      title: `@${data.username as string}`,
      subtitle: data.is_banned ? "アカウント停止中" : "ユーザープロフィール",
      imageUrl: (data.avatar_url as string | null) ?? null,
      link: `/profile/${targetId}`,
      ownerId: data.id as string,
      ownerUsername: data.username as string,
    },
  };
}

async function fetchTargetPreview(
  targetType: ReportTargetType,
  targetId: string,
) {
  switch (targetType) {
    case "video":
      return fetchVideoPreview(targetId);
    case "comment":
      return fetchCommentPreview(targetId);
    case "profile":
      return fetchProfilePreview(targetId);
  }
}

export async function fetchAdminReportQueue(): Promise<AdminReportGroup[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, target_type, target_id, reason, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const grouped = new Map<
    string,
    {
      targetType: ReportTargetType;
      targetId: string;
      reasons: ReportReason[];
      lastReportedAt: string;
    }
  >();

  for (const row of (data ?? []) as ReportRow[]) {
    const key = `${row.target_type}:${row.target_id}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        targetType: row.target_type,
        targetId: row.target_id,
        reasons: [row.reason],
        lastReportedAt: row.created_at,
      });
      continue;
    }
    existing.reasons.push(row.reason);
    if (row.created_at > existing.lastReportedAt) {
      existing.lastReportedAt = row.created_at;
    }
  }

  const groups = await Promise.all(
    [...grouped.values()].map(async (group) => {
      const { isHidden, preview } = await fetchTargetPreview(
        group.targetType,
        group.targetId,
      );
      return {
        targetType: group.targetType,
        targetId: group.targetId,
        reportCount: group.reasons.length,
        reasons: group.reasons,
        lastReportedAt: group.lastReportedAt,
        isHidden,
        preview,
      } satisfies AdminReportGroup;
    }),
  );

  return groups.sort((a, b) => b.reportCount - a.reportCount);
}

export async function adminModerationAction(input: {
  targetType: ReportTargetType;
  targetId: string;
  action: AdminModerationAction;
}): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("admin_moderation_action", {
    p_target_type: input.targetType,
    p_target_id: input.targetId,
    p_action: input.action,
  });

  if (error) throw new Error(error.message);

  if (input.action === "ban") {
    const row = data as { user_id?: string } | null;
    const bannedUserId = row?.user_id;
    if (bannedUserId) {
      await enforceAuthBan(bannedUserId, true);
    }
  }
}

async function enforceAuthBan(
  userId: string,
  banned: boolean,
): Promise<void> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    console.warn("[admin] missing session for enforce-auth-ban");
    return;
  }

  const endpoint = `${getSupabaseUrl()}/functions/v1/enforce-auth-ban`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ userId, banned }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("[admin] enforce-auth-ban failed", res.status, text);
      throw new Error(
        "アカウント停止は記録されましたが、ログイン無効化に失敗しました。再実行するかサポートに連絡してください。",
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("ログイン無効化")) {
      throw err;
    }
    console.error("[admin] enforce-auth-ban network error", err);
    throw new Error(
      "アカウント停止は記録されましたが、ログイン無効化に失敗しました。再実行するかサポートに連絡してください。",
    );
  }
}

export function formatReportReasonSummary(reasons: ReportReason[]): string {
  const counts = new Map<ReportReason, number>();
  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => `${reportReasonLabel(reason)}×${count}`)
    .join(" / ");
}
