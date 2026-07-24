import {
  getFfmpeg,
  safeDeleteFile,
  writeFileFromBlob,
} from "@/lib/video/ffmpeg-client";
import {
  IOS_MP4_MUX_ARGS,
  iosMp4VideoEncodeArgs,
} from "@/lib/video/ios-mp4-encode";

export const SAVE_MASK_SIZE = 720;
export const STARFIELD_ASSET_URL = "/save-mask/starfield.png";
export const CIRCLE_ALPHA_ASSET_URL = "/save-mask/circle-alpha.png";

const assetCache = new Map<string, Blob>();

async function fetchAssetBlob(url: string): Promise<Blob> {
  const cached = assetCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`保存用アセットの取得に失敗しました (${url})`);
  }
  const blob = await res.blob();
  assetCache.set(url, blob);
  return blob;
}

async function execWithLogs(
  ffmpeg: Awaited<ReturnType<typeof getFfmpeg>>,
  args: string[],
): Promise<void> {
  const logs: string[] = [];
  const onLog = ({ message }: { message: string }) => {
    logs.push(message);
  };
  ffmpeg.on("log", onLog);
  try {
    const code = await ffmpeg.exec(args);
    if (code !== 0) {
      const tail = logs.filter((l) => l.trim()).slice(-6).join(" ").trim();
      throw new Error(tail || `ffmpeg exit ${code}`);
    }
  } finally {
    ffmpeg.off("log", onLog);
  }
}

/** 720×720@30 → level 3.1 via shared resolver (not hardcoded). */
const ENCODE_VIDEO_ARGS = (() => {
  const args = iosMp4VideoEncodeArgs({
    preset: "ultrafast",
    width: SAVE_MASK_SIZE,
    height: SAVE_MASK_SIZE,
  });
  // Slightly higher CRF for the small save/share asset.
  const crfIdx = args.indexOf("-crf");
  if (crfIdx >= 0 && args[crfIdx + 1]) args[crfIdx + 1] = "29";
  return args;
})();

/**
 * Compose a 720p circle-masked MP4 on #010102 starfield for save/share.
 * Audio is stream-copied when possible; falls back to AAC.
 */
export async function composeCircleSaveMp4(source: Blob): Promise<File> {
  const ffmpeg = await getFfmpeg();
  const stamp = Date.now().toString(36);
  const inName = `save-in-${stamp}.mp4`;
  const starName = `save-star-${stamp}.png`;
  const maskName = `save-mask-${stamp}.png`;
  const outName = `save-out-${stamp}.mp4`;

  const [starBlob, maskBlob] = await Promise.all([
    fetchAssetBlob(STARFIELD_ASSET_URL),
    fetchAssetBlob(CIRCLE_ALPHA_ASSET_URL),
  ]);

  await writeFileFromBlob(ffmpeg, inName, source);
  await writeFileFromBlob(ffmpeg, starName, starBlob);
  await writeFileFromBlob(ffmpeg, maskName, maskBlob);

  const filterComplex = [
    `[0:v]scale=${SAVE_MASK_SIZE}:${SAVE_MASK_SIZE}:force_original_aspect_ratio=increase,crop=${SAVE_MASK_SIZE}:${SAVE_MASK_SIZE},setsar=1,format=rgba[vid]`,
    `[2:v]scale=${SAVE_MASK_SIZE}:${SAVE_MASK_SIZE},format=gray[mask]`,
    `[vid][mask]alphamerge[circ]`,
    `[1:v]scale=${SAVE_MASK_SIZE}:${SAVE_MASK_SIZE},format=rgba[bg]`,
    `[bg][circ]overlay=0:0:format=auto,format=yuv420p[vout]`,
  ].join(";");

  try {
    try {
      await execWithLogs(ffmpeg, [
        "-i",
        inName,
        "-i",
        starName,
        "-i",
        maskName,
        "-filter_complex",
        filterComplex,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        ...ENCODE_VIDEO_ARGS,
        "-c:a",
        "copy",
        ...IOS_MP4_MUX_ARGS,
        "-shortest",
        outName,
      ]);
    } catch (copyErr) {
      console.warn(
        "[compose-circle-save] audio copy failed, retrying with aac",
        copyErr,
      );
      await safeDeleteFile(ffmpeg, outName);
      await execWithLogs(ffmpeg, [
        "-i",
        inName,
        "-i",
        starName,
        "-i",
        maskName,
        "-filter_complex",
        filterComplex,
        "-map",
        "[vout]",
        "-map",
        "0:a?",
        ...ENCODE_VIDEO_ARGS,
        "-c:a",
        "aac",
        "-b:a",
        "96k",
        "-ac",
        "2",
        ...IOS_MP4_MUX_ARGS,
        "-shortest",
        outName,
      ]);
    }

    const data = await ffmpeg.readFile(outName);
    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    return new File([bytes.slice()], "video-save.mp4", { type: "video/mp4" });
  } finally {
    await safeDeleteFile(ffmpeg, inName);
    await safeDeleteFile(ffmpeg, starName);
    await safeDeleteFile(ffmpeg, maskName);
    await safeDeleteFile(ffmpeg, outName);
  }
}
