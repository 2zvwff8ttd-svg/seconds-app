import {
  BASE_VIDEO_SELECT,
  buildVideoSelect,
  hasExtendedVideoColumns,
  probeVideoSchema,
} from "@/lib/supabase/video-schema";
import { createClient } from "@/lib/supabase/client";
import { normalizeVideoRow, videoRowToFeedVideo } from "@/lib/videos/map-feed";
import type { FeedVideo } from "@/types/feed";

export async function fetchVideoById(videoId: string): Promise<FeedVideo | null> {
  const supabase = createClient();
  const caps = await probeVideoSchema(supabase);
  const select = hasExtendedVideoColumns(caps)
    ? buildVideoSelect(caps)
    : BASE_VIDEO_SELECT;

  const { data, error } = await supabase
    .from("videos")
    .select(select)
    .eq("id", videoId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return videoRowToFeedVideo(
    normalizeVideoRow(data as unknown as Record<string, unknown>),
  );
}
