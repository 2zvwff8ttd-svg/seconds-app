import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { normalizeStorageContentType } from "@/lib/video/media";
import type { SupabaseClient } from "@supabase/supabase-js";

export const MEDIA_BUCKET = "media";

/** このサイズ以上は進捗付き XHR を優先（SDK は途中経過を返さない） */
const XHR_PROGRESS_MIN_BYTES = 256 * 1024;

export function formatUploadSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

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

async function uploadViaXhr(
  path: string,
  body: File,
  normalizedType: string,
  accessToken: string,
  onProgress: (ratio: number) => void,
  fallbackMessage: string,
): Promise<void> {
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
        onProgress(1);
        resolve();
        return;
      }
      reject(
        new Error(
          parseStorageErrorMessage(xhr.responseText, xhr.status) ||
            fallbackMessage,
        ),
      );
    });

    xhr.addEventListener("error", () => {
      reject(new Error(`ネットワークエラー: ${fallbackMessage}`));
    });

    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.setRequestHeader("apikey", getSupabaseAnonKey());
    xhr.setRequestHeader("Content-Type", normalizedType);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.send(body);
  });
}

/**
 * Supabase Storage へアップロード（大きいファイルは XHR で進捗を返す）
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

  const normalizedType = normalizeStorageContentType(contentType);
  const body =
    file instanceof File
      ? file
      : new File([file], "upload.bin", { type: normalizedType });

  onProgress(0);

  const preferXhr = body.size >= XHR_PROGRESS_MIN_BYTES;
  const fallbackMessage = "ストレージへのアップロードに失敗しました";

  if (preferXhr) {
    try {
      await uploadViaXhr(
        path,
        body,
        normalizedType,
        session.access_token,
        onProgress,
        fallbackMessage,
      );
      return;
    } catch (xhrErr) {
      console.warn("[upload] XHR upload failed, trying SDK:", xhrErr);
    }
  }

  onProgress(0.02);

  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, body, {
    contentType: normalizedType,
    upsert: false,
  });

  if (!error) {
    onProgress(1);
    return;
  }

  const sdkMessage = error.message || fallbackMessage;

  await uploadViaXhr(
    path,
    body,
    normalizedType,
    session.access_token,
    onProgress,
    sdkMessage,
  );
}
