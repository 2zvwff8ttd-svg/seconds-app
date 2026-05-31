import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { normalizeStorageContentType } from "@/lib/video/media";
import type { SupabaseClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "media";

export function getMediaPublicUrl(path: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

/**
 * Upload a file to Supabase Storage with XMLHttpRequest progress events.
 */
export async function uploadFileWithProgress(
  supabase: SupabaseClient,
  path: string,
  file: File | Blob,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("ログインが必要です");
  }

  const url = `${getSupabaseUrl()}/storage/v1/object/${MEDIA_BUCKET}/${path}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(event.loaded / event.total);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(xhr.responseText || `アップロードに失敗しました (${xhr.status})`));
    });

    xhr.addEventListener("error", () => {
      reject(new Error("ネットワークエラーが発生しました"));
    });

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", getSupabaseAnonKey());
    xhr.setRequestHeader(
      "Content-Type",
      normalizeStorageContentType(contentType),
    );
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(file);
  });
}
