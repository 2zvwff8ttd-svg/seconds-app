import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";

export type NativeVideoSource = {
  videoFilePath: string;
  videoFileName?: string;
  videoBase64?: string;
  videoFileSize?: number;
};

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function blobFromNativeBase64(
  source: NativeVideoSource,
): Promise<Blob | null> {
  const base64 = source.videoBase64?.trim();
  if (!base64) return null;

  const blob = base64ToBlob(base64, "video/mp4");
  if (blob.size === 0) {
    throw new Error("ネイティブから受け取った録画データが空です");
  }

  if (
    typeof source.videoFileSize === "number" &&
    source.videoFileSize > 0 &&
    blob.size < source.videoFileSize * 0.9
  ) {
    throw new Error(
      `録画データが不完全です (expected≈${source.videoFileSize}, got=${blob.size})`,
    );
  }

  return blob;
}

function resolveFileName(source: NativeVideoSource): string | null {
  const fromNative = source.videoFileName?.trim();
  if (fromNative) return fromNative;

  const path = source.videoFilePath.trim().replace(/^file:\/\//, "");
  const fileName = path.split("/").filter(Boolean).pop();
  return fileName ?? null;
}

async function readBlobViaFilesystem(
  source: NativeVideoSource,
): Promise<Blob> {
  const fileName = resolveFileName(source);
  if (!fileName) {
    throw new Error("録画ファイル名を特定できませんでした");
  }

  const attempts: Array<{ path: string; directory?: Directory }> = [
    { path: fileName, directory: Directory.Cache },
    { path: fileName, directory: Directory.Data },
    { path: fileName, directory: Directory.Documents },
  ];

  const errors: string[] = [];
  for (const opts of attempts) {
    try {
      const result = await Filesystem.readFile({
        path: opts.path,
        directory: opts.directory,
      });
      if (typeof result.data !== "string" || !result.data) {
        throw new Error("Filesystem.readFile returned empty data");
      }
      const blob = base64ToBlob(result.data, "video/mp4");
      if (blob.size > 0) {
        return blob;
      }
      throw new Error("Filesystem.readFile returned zero-size blob");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(
        `${opts.directory ?? "no-dir"}/${opts.path}: ${message}`,
      );
    }
  }

  throw new Error(
    `Filesystem で録画ファイルを読み込めませんでした (${errors.join(" | ")})`,
  );
}

async function readBlobViaWebView(videoFilePath: string): Promise<Blob> {
  const src = Capacitor.convertFileSrc(videoFilePath);
  const response = await fetch(src);
  if (!response.ok) {
    throw new Error(`WebView fetch failed (${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error("WebView fetch returned empty blob");
  }
  return blob;
}

async function readNativeVideoBlob(source: NativeVideoSource): Promise<Blob> {
  const errors: string[] = [];

  try {
    const fromBase64 = await blobFromNativeBase64(source);
    if (fromBase64) {
      console.info(
        `[native-recording-file] loaded via native base64 (${fromBase64.size} bytes)`,
      );
      return fromBase64;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`native-base64: ${message}`);
    console.warn("[native-recording-file] native base64 failed:", message);
  }

  if (Capacitor.isNativePlatform()) {
    try {
      const fromFilesystem = await readBlobViaFilesystem(source);
      console.info(
        `[native-recording-file] loaded via Filesystem (${fromFilesystem.size} bytes)`,
      );
      return fromFilesystem;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`filesystem: ${message}`);
      console.warn("[native-recording-file] Filesystem failed:", message);
    }
  }

  try {
    const fromWebView = await readBlobViaWebView(source.videoFilePath);
    console.info(
      `[native-recording-file] loaded via WebView (${fromWebView.size} bytes)`,
    );
    return fromWebView;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`webview: ${message}`);
  }

  throw new Error(
    `録画ファイルを読み込めませんでした: ${errors.join(" / ")}`,
  );
}

/** camera-preview の録画結果 → 投稿パイプライン用 File */
export async function nativeVideoSourceToFile(
  source: NativeVideoSource,
): Promise<File> {
  const normalizedPath = source.videoFilePath?.trim();
  if (!normalizedPath) {
    throw new Error("録画ファイルのパスが空です");
  }

  await waitMs(200);

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const blob = await readNativeVideoBlob(source);
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

/** @deprecated use nativeVideoSourceToFile */
export async function nativeVideoPathToFile(
  videoFilePath: string,
): Promise<File> {
  return nativeVideoSourceToFile({ videoFilePath });
}
