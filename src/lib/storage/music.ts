import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";
import type { PresetBgmTrack } from "@/types/preset-bgm";

export const MUSIC_BUCKET = "music";

const AUDIO_FILE_PATTERN = /\.(mp3|mpeg|wav|ogg|m4a|aac|flac)$/i;

export function getMusicPublicUrl(path: string): string {
  const encoded = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${getSupabaseUrl()}/storage/v1/object/public/${MUSIC_BUCKET}/${encoded}`;
}

function pathToDisplayName(path: string): string {
  const base = path.split("/").pop() ?? path;
  const withoutExt = base.replace(/\.[^.]+$/, "");
  return decodeURIComponent(withoutExt.replace(/[-_]+/g, " ").trim()) || base;
}

function isAudioFile(name: string): boolean {
  return AUDIO_FILE_PATTERN.test(name);
}

async function listMusicInFolder(
  prefix: string,
): Promise<PresetBgmTrack[]> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(MUSIC_BUCKET).list(prefix, {
    limit: 200,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    if (
      error.message.includes("Bucket not found") ||
      error.message.includes("not found")
    ) {
      return [];
    }
    throw new Error(error.message);
  }

  const tracks: PresetBgmTrack[] = [];

  for (const item of data ?? []) {
    if (!item.name) continue;
    const path = prefix ? `${prefix}/${item.name}` : item.name;

    const isFolder =
      item.metadata == null && !isAudioFile(item.name);
    if (isFolder) {
      const nested = await listMusicInFolder(path);
      tracks.push(...nested);
      continue;
    }

    if (!isAudioFile(item.name)) continue;

    tracks.push({
      id: path,
      path,
      name: pathToDisplayName(path),
      publicUrl: getMusicPublicUrl(path),
    });
  }

  return tracks;
}

/** `music` バケット内のプリセット曲一覧 */
export async function fetchPresetBgmTracks(): Promise<PresetBgmTrack[]> {
  const tracks = await listMusicInFolder("");
  return tracks.sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

/** 合成用に BGM ファイルを取得 */
export async function fetchPresetBgmBlob(track: PresetBgmTrack): Promise<Blob> {
  const res = await fetch(track.publicUrl);
  if (!res.ok) {
    throw new Error(`BGMの読み込みに失敗しました (${res.status})`);
  }
  const blob = await res.blob();
  if (!blob.size) {
    throw new Error("BGMファイルが空です");
  }
  return blob;
}
