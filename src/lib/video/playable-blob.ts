import { normalizeStorageContentType } from "@/lib/video/media";

function mimeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  return "video/mp4";
}

/** Codec suffixes stripped; falls back to file extension. */
export function resolveVideoMimeType(
  mimeType: string | undefined,
  fileName: string,
): string {
  const trimmed = mimeType?.split(";")[0]?.trim();
  if (trimmed) return normalizeStorageContentType(trimmed);
  return normalizeStorageContentType(mimeFromFileName(fileName));
}

function clipFileName(id: string, mimeType: string): string {
  if (mimeType.includes("webm")) return `clip-${id}.webm`;
  if (mimeType.includes("quicktime")) return `clip-${id}.mov`;
  return `clip-${id}.mp4`;
}

/**
 * Materialize clip bytes with an explicit MIME type.
 * Safari can fail to decode IndexedDB-restored Blobs unless bytes are copied.
 */
export async function materializeVideoFile(
  source: Blob,
  options: { mimeType?: string; fileName?: string; id?: string },
): Promise<File> {
  const mimeType = resolveVideoMimeType(
    options.mimeType ?? source.type,
    options.fileName ?? "",
  );
  const fileName =
    options.fileName?.trim() ||
    (options.id ? clipFileName(options.id, mimeType) : `clip-${Date.now()}.mp4`);

  const buffer = await source.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error("動画データが空です");
  }

  const blob = new Blob([buffer], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
}

export async function materializeVideoBlob(file: File): Promise<Blob> {
  const materialized = await materializeVideoFile(file, {
    mimeType: file.type,
    fileName: file.name,
  });
  return materialized;
}
