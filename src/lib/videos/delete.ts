import { extractMediaStoragePath } from "@/lib/storage/paths";
import { MEDIA_BUCKET } from "@/lib/storage/upload";
import { createClient } from "@/lib/supabase/client";

async function collectMediaPathsForVideo(
  userId: string,
  videoId: string,
  urls: Array<string | null | undefined>,
): Promise<string[]> {
  const supabase = createClient();
  const paths = new Set<string>();

  for (const url of urls) {
    if (!url) continue;
    const path = extractMediaStoragePath(url);
    if (path?.startsWith(`${userId}/`)) {
      paths.add(path);
    }
  }

  const folderPrefix = `${userId}/${videoId}`;
  const { data: listed, error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .list(folderPrefix);

  if (!error) {
    for (const item of listed ?? []) {
      if (item.name) {
        paths.add(`${folderPrefix}/${item.name}`);
      }
    }
  }

  return [...paths];
}

export async function deleteOwnVideo(videoId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const { data: video, error: fetchError } = await supabase
    .from("videos")
    .select("id, user_id, video_url, thumbnail_url, bgm_url")
    .eq("id", videoId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!video) throw new Error("動画が見つかりません");
  if (video.user_id !== user.id) {
    throw new Error("自分の投稿のみ削除できます");
  }

  const { data: clips, error: clipsError } = await supabase
    .from("clips")
    .select("clip_url")
    .eq("video_id", videoId);

  if (clipsError) throw new Error(clipsError.message);

  const storagePaths = await collectMediaPathsForVideo(
    user.id,
    videoId,
    [
      video.video_url,
      video.thumbnail_url,
      video.bgm_url,
      ...(clips ?? []).map((clip) => clip.clip_url as string),
    ],
  );

  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage
      .from(MEDIA_BUCKET)
      .remove(storagePaths);

    if (storageError) {
      throw new Error(`ストレージの削除に失敗しました: ${storageError.message}`);
    }
  }

  const { error: deleteError } = await supabase
    .from("videos")
    .delete()
    .eq("id", videoId)
    .eq("user_id", user.id);

  if (deleteError) throw new Error(deleteError.message);
}
