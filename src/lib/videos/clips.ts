import { createClient } from "@/lib/supabase/client";

export async function fetchVideoClipUrls(videoId: string): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("clips")
    .select("clip_url, clip_order")
    .eq("video_id", videoId)
    .order("clip_order", { ascending: true });

  if (error) throw new Error(error.message);
  if (!data?.length) return [];
  return data.map((row) => row.clip_url);
}
