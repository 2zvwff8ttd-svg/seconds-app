import { Capacitor } from "@capacitor/core";

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function readBlobViaXHR(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", src, true);
    xhr.responseType = "blob";
    xhr.onload = () => {
      const blob = xhr.response as Blob | null;
      if ((xhr.status === 200 || xhr.status === 0) && blob && blob.size > 0) {
        resolve(blob);
        return;
      }
      reject(
        new Error(
          `動画ファイルの読み込みに失敗しました (XHR status=${xhr.status}, size=${blob?.size ?? 0})`,
        ),
      );
    };
    xhr.onerror = () => {
      reject(new Error("動画ファイルの読み込みに失敗しました (XHR Load failed)"));
    };
    xhr.send();
  });
}

async function readBlobViaFetch(src: string): Promise<Blob> {
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`動画ファイルの読み込みに失敗しました (fetch ${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("動画ファイルが空です");
  }
  return blob;
}

/** iOS WKWebView では fetch(capacitor://…) が Load failed になることがあるため XHR を優先 */
async function readNativeVideoBlob(videoFilePath: string): Promise<Blob> {
  const src = Capacitor.convertFileSrc(videoFilePath);
  const errors: string[] = [];

  for (const attempt of [readBlobViaXHR, readBlobViaFetch] as const) {
    try {
      return await attempt(src);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      console.warn("[native-recording-file] read attempt failed:", message);
    }
  }

  throw new Error(
    `録画ファイルを読み込めませんでした: ${errors.join(" / ")}`,
  );
}

/** camera-preview の file path → 投稿パイプライン用 File（mp4 固定） */
export async function nativeVideoPathToFile(
  videoFilePath: string,
): Promise<File> {
  const normalizedPath = videoFilePath.trim();
  if (!normalizedPath) {
    throw new Error("録画ファイルのパスが空です");
  }

  // stopRecordVideo 直後はファイル書き込みが完了していないことがある
  await waitMs(200);

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const blob = await readNativeVideoBlob(normalizedPath);
      const type = blob.type.includes("video") ? blob.type : "video/mp4";
      return new File([blob], `clip-${Date.now()}.mp4`, { type });
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await waitMs(150 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("録画ファイルの読み込みに失敗しました");
}
