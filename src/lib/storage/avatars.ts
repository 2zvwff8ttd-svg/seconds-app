import { getSupabaseUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/client";

const AVATARS_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

const ALLOWED_AVATAR_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function assertAllowedAvatarMime(contentType: string): string {
  const base = contentType.split(";")[0].trim().toLowerCase();
  if (!ALLOWED_AVATAR_MIME.has(base)) {
    throw new Error(
      "対応していない画像形式です（JPEG / PNG / WebP / GIF）",
    );
  }
  return base;
}

export function getAvatarPublicUrl(path: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${AVATARS_BUCKET}/${path}`;
}

function avatarExtension(file: File): string {
  const fromMime = EXT_BY_MIME[file.type];
  if (fromMime) return fromMime;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".webp")) return "webp";
  if (name.endsWith(".gif")) return "gif";
  return "jpg";
}

function storagePathFromPublicUrl(url: string, userId: string): string | null {
  const marker = `/storage/v1/object/public/${AVATARS_BUCKET}/${userId}/`;
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  const rest = url.slice(idx + marker.length).split("?")[0];
  if (!rest) return null;
  return `${userId}/${decodeURIComponent(rest)}`;
}

async function removeOtherAvatars(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  keepPath: string,
) {
  const { data: listed, error: listError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .list(userId, { limit: 100 });

  if (listError || !listed?.length) return;

  const toRemove = listed
    .map((item) => item.name)
    .filter((name) => Boolean(name) && `${userId}/${name}` !== keepPath)
    .map((name) => `${userId}/${name}`);

  if (toRemove.length === 0) return;

  const { error: removeError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .remove(toRemove);

  if (removeError) {
    console.warn("[avatars] cleanup failed", removeError.message);
  }
}

async function uploadAvatarObject(
  file: Blob,
  options: {
    contentType: string;
    extension: string;
  },
): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error("画像は5MB以下にしてください");
  }

  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログインが必要です");
  }

  const version =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}`;
  const path = `${user.id}/avatar-${version}.${options.extension}`;

  const { error: uploadError } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(path, file, {
      contentType: options.contentType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const publicUrl = getAvatarPublicUrl(path);
  const { data: previous } = await supabase
    .from("profiles")
    .select("avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: publicUrl })
    .eq("id", user.id);

  if (profileError) {
    await supabase.storage.from(AVATARS_BUCKET).remove([path]);
    throw new Error(profileError.message);
  }

  const previousUrl =
    typeof previous?.avatar_url === "string" ? previous.avatar_url : null;
  const previousPath = previousUrl
    ? storagePathFromPublicUrl(previousUrl, user.id)
    : null;

  // Best-effort: drop every other object in the user's folder (including previous).
  await removeOtherAvatars(supabase, user.id, path);
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(AVATARS_BUCKET).remove([previousPath]);
  }

  return publicUrl;
}

export async function uploadProfileAvatar(file: File): Promise<string> {
  const contentType = assertAllowedAvatarMime(file.type || "image/jpeg");
  const ext = avatarExtension(file);
  return uploadAvatarObject(file, {
    contentType,
    extension: ext,
  });
}

/** Persist an AI-generated (or staged) image blob as the active avatar. */
export async function uploadProfileAvatarBlob(
  blob: Blob,
  options?: { contentType?: string; extension?: string },
): Promise<string> {
  const contentType = assertAllowedAvatarMime(
    options?.contentType || blob.type || "image/webp",
  );
  const extension =
    options?.extension ||
    EXT_BY_MIME[contentType] ||
    (contentType.includes("png")
      ? "png"
      : contentType.includes("webp")
        ? "webp"
        : "jpg");

  return uploadAvatarObject(blob, { contentType, extension });
}

export async function convertPngBase64ToWebpBlob(
  imageBase64: string,
): Promise<Blob> {
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pngBlob = new Blob([bytes], { type: "image/png" });

  if (typeof createImageBitmap === "function" && typeof OffscreenCanvas !== "undefined") {
    try {
      const bitmap = await createImageBitmap(pngBlob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();
      const webp = await canvas.convertToBlob({
        type: "image/webp",
        quality: 0.9,
      });
      if (webp.size > 0) return webp;
    } catch {
      // Fall through to PNG upload.
    }
  }

  return pngBlob;
}
