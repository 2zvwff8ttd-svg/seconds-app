import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { normalizeStorageContentType } from "@/lib/video/media";
import type { SupabaseClient } from "@supabase/supabase-js";

const MEDIA_BUCKET = "media";

export function getMediaPublicUrl(path: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

function parseStorageErrorMessage(raw: string, status: number): string {
  const trimmed = raw.trim();
  if (!trimmed) return `アップロードに失敗しました (HTTP ${status})`;
  try {
    const json = JSON.parse(trimmed) as {
      message?: string;
      error?: string;
      statusCode?: string;
    };
    return json.message || json.error || trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Supabase Storage へアップロード（公式 SDK を優先）
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

  onProgress(0.05);

  const normalizedType = normalizeStorageContentType(contentType);
  const body =
    file instanceof File
      ? file
      : new File([file], "upload.bin", { type: normalizedType });

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, body, {
    contentType: normalizedType,
    upsert: false,
  });

  if (!error) {
    onProgress(1);
    return;
  }

  const sdkMessage = error.message || "ストレージへのアップロードに失敗しました";

  // SDK が失敗した場合のみ XHR にフォールバック（進捗表示用）
  const url = `${getSupabaseUrl()}/storage/v1/object/${MEDIA_BUCKET}/${path}`;

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(0.1 + (event.loaded / event.total) * 0.9);
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
        return;
      }
      reject(
        new Error(
          parseStorageErrorMessage(xhr.responseText, xhr.status) ||
            sdkMessage,
        ),
      );
    });

    xhr.addEventListener("error", () => {
      reject(new Error(`ネットワークエラー: ${sdkMessage}`));
    });

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
    xhr.setRequestHeader("apikey", getSupabaseAnonKey());
    xhr.setRequestHeader("Content-Type", normalizedType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(body);
  });
}
