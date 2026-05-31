export function getPreferredMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "video/webm";
}

export function mimeToExtension(mime: string): string {
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}

export function facingModeLabel(mode: "user" | "environment"): string {
  return mode === "user" ? "インカメラ" : "アウトカメラ";
}
