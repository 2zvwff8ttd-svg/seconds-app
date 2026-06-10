import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

const FFMPEG_PUBLIC_BASE = "/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

export async function getFfmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (!loadPromise) {
    loadPromise = (async () => {
      const ffmpeg = new FFmpeg();
      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(
            `${FFMPEG_PUBLIC_BASE}/ffmpeg-core.js`,
            "text/javascript",
          ),
          wasmURL: await toBlobURL(
            `${FFMPEG_PUBLIC_BASE}/ffmpeg-core.wasm`,
            "application/wasm",
          ),
        });
      } catch {
        throw new Error(
          "動画合成エンジンの読み込みに失敗しました。`npm install` 後に開発サーバーを再起動してください。",
        );
      }
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })();
  }

  return loadPromise;
}

export async function safeDeleteFile(
  ffmpeg: FFmpeg,
  name: string,
): Promise<void> {
  try {
    await ffmpeg.deleteFile(name);
  } catch {
    /* ignore */
  }
}

export async function writeFileFromBlob(
  ffmpeg: FFmpeg,
  name: string,
  blob: Blob,
): Promise<void> {
  const buffer = await blob.arrayBuffer();
  await ffmpeg.writeFile(name, new Uint8Array(buffer));
}
