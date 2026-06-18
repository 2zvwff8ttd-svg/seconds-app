import type { SupabaseClient } from "@supabase/supabase-js";

export type VideoSchemaCapabilities = {
  hasStatus: boolean;
  hasPublishAt: boolean;
  hasPublishedAt: boolean;
  hasBgmUrl: boolean;
  hasClipThumbnailUrls: boolean;
  hasDisplayMaskShape: boolean;
  hasInsertRpc: boolean;
};

let cachedCapabilities: VideoSchemaCapabilities | null = null;

function isMissingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("schema cache") ||
    lower.includes("could not find") ||
    lower.includes("does not exist") ||
    lower.includes("42703")
  );
}

function isMissingRpcError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("could not find the function") ||
    lower.includes("pgrst202") ||
    (lower.includes("schema cache") && lower.includes("function"))
  );
}

async function probeColumn(
  supabase: SupabaseClient,
  column: string,
): Promise<boolean> {
  const { error } = await supabase.from("videos").select(column).limit(0);
  if (!error) return true;
  if (isMissingColumnError(error.message)) return false;
  // Permission or network errors: assume column missing to avoid bad queries
  return false;
}

async function probeInsertRpc(supabase: SupabaseClient): Promise<boolean> {
  const { error } = await supabase.rpc("insert_pending_video", {
    p_id: "00000000-0000-0000-0000-000000000000",
    p_user_id: "00000000-0000-0000-0000-000000000000",
    p_video_url: "",
    p_thumbnail_url: "",
    p_title: "",
    p_duration_seconds: 0,
    p_visibility: "public",
    p_country: "JP",
  });

  if (!error) return true;

  if (
    error.message.includes("Unauthorized") ||
    error.message.includes("permission denied") ||
    error.code === "42501"
  ) {
    return true;
  }

  if (isMissingRpcError(error.message)) return false;

  return false;
}

export async function probeVideoSchema(
  supabase: SupabaseClient,
  options?: { force?: boolean },
): Promise<VideoSchemaCapabilities> {
  if (cachedCapabilities && !options?.force) return cachedCapabilities;

  const [
    hasStatus,
    hasPublishAt,
    hasPublishedAt,
    hasBgmUrl,
    hasClipThumbnailUrls,
    hasDisplayMaskShape,
    hasInsertRpc,
  ] = await Promise.all([
    probeColumn(supabase, "status"),
    probeColumn(supabase, "publish_at"),
    probeColumn(supabase, "published_at"),
    probeColumn(supabase, "bgm_url"),
    probeColumn(supabase, "clip_thumbnail_urls"),
    probeColumn(supabase, "display_mask_shape"),
    probeInsertRpc(supabase),
  ]);

  cachedCapabilities = {
    hasStatus,
    hasPublishAt,
    hasPublishedAt,
    hasBgmUrl,
    hasClipThumbnailUrls,
    hasDisplayMaskShape,
    hasInsertRpc,
  };

  return cachedCapabilities;
}

export function clearVideoSchemaCache() {
  cachedCapabilities = null;
}

/** Client-side fallback: next day 7:00 JST (matches DB trigger) */
export function computeNextPublishAtJst(from = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);

  const [year, month, day] = parts.split("-").map(Number);
  const publishJst = new Date(
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T07:00:00+09:00`,
  );
  publishJst.setDate(publishJst.getDate() + 1);
  return publishJst.toISOString();
}

/** videos.user_id → profiles（video_engagements 経由の M2M と区別） */
export const VIDEO_CREATOR_PROFILE_EMBED =
  "profiles!user_id(username, avatar_url)";

export const BASE_VIDEO_SELECT = `
  id,
  user_id,
  video_url,
  thumbnail_url,
  title,
  duration_seconds,
  visibility,
  country,
  view_count,
  created_at,
  ${VIDEO_CREATOR_PROFILE_EMBED}
`;

export function buildVideoSelect(caps: VideoSchemaCapabilities): string {
  const extras: string[] = [];
  if (caps.hasStatus) extras.push("status");
  if (caps.hasPublishAt) extras.push("publish_at");
  if (caps.hasPublishedAt) extras.push("published_at");
  if (caps.hasBgmUrl) extras.push("bgm_url");
  if (caps.hasClipThumbnailUrls) extras.push("clip_thumbnail_urls");
  if (caps.hasDisplayMaskShape) extras.push("display_mask_shape");
  if (extras.length === 0) return BASE_VIDEO_SELECT;
  return BASE_VIDEO_SELECT.replace(
    "created_at,",
    `created_at, ${extras.join(", ")},`,
  );
}

export function isSchemaMismatchError(message: string): boolean {
  return isMissingColumnError(message) || isMissingRpcError(message);
}
